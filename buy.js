import {querySudo as query, updateSudo as update} from '@lblod/mu-auth-sudo';
import {objectToString} from "./helper";
import {v4 as uuid} from 'uuid'
import {getAuthFetchForWebId} from "./auth-css";

export async function findOfferingDetails(buyerPod, sellerPod, offeringId) {
    const offeringsQuery = `
    PREFIX gr: <http://purl.org/goodrelations/v1#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT ?product ?currency ?currencyValue ?name ?description ?productName ?productDescription ?pod ?seller ?sellerWebId
    FROM <http://mu.semte.ch/graphs/public>
    WHERE {
        ?product a gr:ProductOrService.
        ?offering a gr:Offering.
        ?priceSpecification a gr:PriceSpecification;
            gr:hasCurrency ?currency;
            gr:hasCurrencyValue ?currencyValue.
        ?offering gr:name ?name;
            gr:description ?description;
            gr:includes ?product;
            ext:pod ?pod;
            gr:hasPriceSpecification ?priceSpecification.
        ?product gr:name ?productName;
            gr:description ?productDescription.
        ?sellerEntity a gr:BusinessEntity;
            gr:legalName ?seller;
            gr:description ?sellerWebId;
            gr:offers ?offering.
        FILTER (?offering = <${offeringId}> && ?pod = <${sellerPod}>)
    }`;

    return query(offeringsQuery);
}

export async function storeMollieApiKey(sellerWebId, apiKey) {
    const storeQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    DELETE { GRAPH <http://mu.semte.ch/application> {
        <${sellerWebId}> ext:mollieApiKey ?mollieApiKey.
    } }
    WHERE {
        <${sellerWebId}> ext:mollieApiKey ?mollieApiKey.
    }
    
    INSERT DATA { GRAPH <http://mu.semte.ch/application> {
        <${sellerWebId}> ext:mollieApiKey "${apiKey}".
    } }`;

    return update(storeQuery);
}

export async function getPaymentInformationFromPaymentId(paymentId) {
    const queryQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX schema: <http://schema.org/>
    SELECT ?orderStatus ?buyerPod ?sellerPod ?order ?seller ?customer
    FROM <http://mu.semte.ch/application>
    WHERE {
        ?order a schema:Order;
            schema:paymentMethodId "${paymentId}";
            schema:orderStatus ?orderStatus;
            ext:sellerPod ?sellerPod;
            ext:buyerPod ?buyerPod;
            schema:seller ?seller;
            schema:customer ?customer;
    }`;

    return query(queryQuery);
}

export async function saveOrder(queryEngine, offer, buyerPod, sellerPod, buyerWebId, sellerWebId, brokerWebId) {
    const offerUUID = `${sellerPod}/private/tests/my-offerings.ttl#${uuid()}`;
    const orderUUID = `${sellerPod}/private/tests/my-offerings.ttl#${uuid()}`;
    const orderDate = new Date().toISOString();

    // Extra graphStmt boolean because CSS does not support GRAPH statements and update in 'mu' errors 400 without.
    const insertOrderQuery = (graphStmt) => `
    PREFIX schema: <http://schema.org/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    INSERT { ${graphStmt ? 'GRAPH <http://mu.semte.ch/application> {' : ''}
        ?offer a schema:Offer;
            schema:name "${offer.name.value}";
            schema:description "${offer.description.value}";
            schema:price ${objectToString(offer.currencyValue)};
            schema:priceCurrency "${offer.currency.value}";
            schema:seller <${sellerWebId}>.
        ?order a schema:Order;
            schema:acceptedOffer ?offer;
            schema:orderStatus <http://schema.org/OrderPaymentDue>;
            schema:seller <${sellerWebId}>;
            schema:customer <${buyerWebId}>;
            schema:broker <${brokerWebId}>;
            schema:orderDate "${orderDate}";
            ext:sellerPod "${sellerPod}";
            ext:buyerPod "${buyerPod}".
    } ${graphStmt ? '}' : ''}
    WHERE {
        BIND(IRI("${offerUUID}") AS ?offer)
        BIND(IRI("${orderUUID}") AS ?order)
    }`;

    try {
        await Promise.all([
            update(insertOrderQuery(true)),
            queryEngine.queryVoid(insertOrderQuery(false), {
                destination: `${buyerPod}/private/tests/my-offerings.ttl`,
                fetch: await getAuthFetchForWebId(buyerWebId)
            }),
            queryEngine.queryVoid(insertOrderQuery(false), {
                destination: `${sellerPod}/private/tests/my-offerings.ttl`,
                fetch: await getAuthFetchForWebId(sellerWebId)
            }),
        ]);
    } catch (e) {
        console.error(e);
        return null;
    }

    return {offerUUID, orderUUID};
}

export async function updateOrder(queryEngine, orderStatus, buyerPod, sellerPod, orderUUID, paymentId, sellerWebId, buyerWebId) {
    const deletePodReferencesQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    DELETE DATA { GRAPH <http://mu.semte.ch/application> {
        <${orderUUID}> ext:sellerPod "${sellerPod}";
            ext:buyerPod "${buyerPod}".
    } }`;

    const deleteQuery = `
    PREFIX schema: <http://schema.org/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    DELETE DATA {
        <${orderUUID}> schema:orderStatus <http://schema.org/OrderPaymentDue>;
            ext:sellerPod "${sellerPod}";
            ext:buyerPod "${buyerPod}".
    }`;

    const insertQuery = `
    PREFIX schema: <http://schema.org/>
    INSERT DATA {
        <${orderUUID}> schema:orderStatus <${orderStatus}>;
            schema:paymentMethodId "${paymentId}";
    }`;

    const sellerAuthFetch = await getAuthFetchForWebId(sellerWebId);
    const buyerAuthFetch = await getAuthFetchForWebId(buyerWebId);

    try {
        await Promise.all([
            update(deletePodReferencesQuery),
            queryEngine.queryVoid(deleteQuery, {
                destination: `${buyerPod}/private/tests/my-offerings.ttl`,
                fetch: buyerAuthFetch
            }),
            queryEngine.queryVoid(deleteQuery, {
                destination: `${sellerPod}/private/tests/my-offerings.ttl`,
                fetch: sellerAuthFetch
            }),
        ]);
        await Promise.all([
            queryEngine.queryVoid(insertQuery, {
                destination: `${buyerPod}/private/tests/my-offerings.ttl`,
                fetch: buyerAuthFetch
            }),
            queryEngine.queryVoid(insertQuery, {
                destination: `${sellerPod}/private/tests/my-offerings.ttl`,
                fetch: sellerAuthFetch
            }),
        ]);
    } catch (e) {
        console.error(e);
        return false;
    }

    return true;
}
