import createMollieClient from '@mollie/api-client';
import {query, update} from 'mu';
import {objectToString} from "./helper";
import {v4 as uuid} from 'uuid'

const MOLLIE_REDIRECT_URL = process.env.MOLLIE_REDIRECT_URL;
const MOLLIE_BASE_WEBHOOK_URL = process.env.MOLLIE_BASE_WEBHOOK_URL;

export async function findOfferingDetails(buyerPod, sellerPod, offeringId) {
    const offeringsQuery = `
    PREFIX gr: <http://purl.org/goodrelations/v1#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT ?product ?currency ?currencyValue ?name ?description ?productName ?productDescription ?pod ?seller ?sellerWebId
    FROM <http://mu.semte.ch/application>
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

export async function getMollieApiKey(sellerWebId) {
    const queryQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT ?mollieApiKey
    FROM <http://mu.semte.ch/application>
    WHERE {
        <${sellerWebId}> ext:mollieApiKey ?mollieApiKey.
    }`;

    return query(queryQuery);
}

export async function getPaymentInformationFromPaymentId(paymentId) {
    const queryQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX schema: <http://schema.org/>
    SELECT ?mollieApiKey ?buyerPod ?sellerPod ?order
    FROM <http://mu.semte.ch/application>
    WHERE {
        ?order a schema:Order;
            schema:paymentMethodId "${paymentId}";
            ext:sellerPod ?sellerPod;
            ext:buyerPod ?buyerPod;
            schema:seller ?seller.
        ?seller ext:mollieApiKey ?mollieApiKey.
    }`;

    return query(queryQuery);
}

export async function handlePayment(offeringName, price, mollieApiKey) {
    const mollieClient = createMollieClient({apiKey: mollieApiKey});

    return await mollieClient.payments.create({
        amount: {
            value: Number(price).toFixed(2),
            currency: 'EUR'
        },
        description: `Payment for ${offeringName} via The Solid Shop.`,
        redirectUrl: MOLLIE_REDIRECT_URL,
        webhookUrl: MOLLIE_BASE_WEBHOOK_URL
    });
}

export async function checkPayment(paymentId, apiKey) {
    const mollieClient = createMollieClient({apiKey: apiKey});

    const payment = await mollieClient.payments.get(paymentId);
    return (payment?.status === 'paid');
}

export async function saveOrder(queryEngine, offer, buyerPod, sellerPod, buyerWebId, sellerWebId, brokerWebId, paymentId) {
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
            ext:buyerPod "${buyerPod}";
            schema:paymentMethodId "${paymentId}".
    } ${graphStmt ? '}' : ''}
    WHERE {
        BIND(IRI("${offerUUID}") AS ?offer)
        BIND(IRI("${orderUUID}") AS ?order)
    }`;

    try {
        await update(insertOrderQuery(true));
        await queryEngine.queryVoid(insertOrderQuery(false), {destination: `${buyerPod}/private/tests/my-offerings.ttl`});
        await queryEngine.queryVoid(insertOrderQuery(false), {destination: `${sellerPod}/private/tests/my-offerings.ttl`});
    } catch (e) {
        console.error(e);
        return null;
    }

    return {offerUUID, orderUUID};
}

export async function confirmPayment(queryEngine, buyerPod, sellerPod, orderUUID) {
    const deleteQuery = (graphStmt) => `
    PREFIX schema: <http://schema.org/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    DELETE DATA { ${graphStmt ? 'GRAPH <http://mu.semte.ch/application> {' : ''}
        <${orderUUID}> schema:orderStatus <http://schema.org/OrderPaymentDue>;
            ext:sellerPod "${sellerPod}";
            ext:buyerPod "${buyerPod}".
    } ${graphStmt ? '}' : ''}`;

    const insertQuery = (graphStmt) => `
    PREFIX schema: <http://schema.org/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    INSERT DATA { ${graphStmt ? 'GRAPH <http://mu.semte.ch/application> {' : ''}
        <${orderUUID}> schema:orderStatus <http://schema.org/OrderDelivered>.
    } ${graphStmt ? '}' : ''}`;

    try {
        await update(deleteQuery(true));
        await queryEngine.queryVoid(deleteQuery(false), {destination: `${buyerPod}/private/tests/my-offerings.ttl`});
        await queryEngine.queryVoid(deleteQuery(false), {destination: `${sellerPod}/private/tests/my-offerings.ttl`});
        await update(insertQuery(true));
        await queryEngine.queryVoid(insertQuery(false), {destination: `${buyerPod}/private/tests/my-offerings.ttl`});
        await queryEngine.queryVoid(insertQuery(false), {destination: `${sellerPod}/private/tests/my-offerings.ttl`});
    } catch (e) {
        console.error(e);
        return false;
    }

    return true;
}