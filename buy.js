import {query, update} from 'mu';
import {objectToString} from "./helper";

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

export function handlePayment(offeringName, price) {
    console.log(`MOCK Payment of ${price} for ${offeringName}`);
    return true;
}

export async function saveOrder(queryEngine, offer, buyerPod, sellerPod, buyerWebId, sellerWebId, brokerWebId) {
    // Extra graphStmt boolean because CSS does not support GRAPH statements and update in 'mu' errors 400 without.
    const insertOrderQuery = (graphStmt) => `
    PREFIX schema: <http://schema.org/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    INSERT { ${ graphStmt ? 'GRAPH <http://mu.semte.ch/application> {' : '' }
        ?offer a schema:Offer;
            schema:name "${offer.name.value}";
            schema:description "${offer.description.value}";
            schema:price ${objectToString(offer.currencyValue)};
            schema:priceCurrency "${offer.currency.value}";
            schema:seller "${sellerWebId}".
        ?order a schema:Order;
            schema:acceptedOffer ?offer;
            schema:orderStatus "http://schema.org/OrderDelivered";
            schema:seller "${sellerWebId}";
            schema:customer "${buyerWebId}";
            schema:broker "${brokerWebId}";
            schema:orderDate "${new Date().toISOString()}".
    } ${ graphStmt ? '}' : '' }
    WHERE {
        BIND(IRI(CONCAT("${sellerPod}/private/tests/my-offerings.ttl#", STRUUID())) AS ?offer)
        BIND(IRI(CONCAT("${sellerPod}/private/tests/my-offerings.ttl#", STRUUID())) AS ?order)
    }`;

    try {
        await update(insertOrderQuery(true));
        await queryEngine.queryVoid(insertOrderQuery(false), {destination: `${buyerPod}/private/tests/my-offerings.ttl`});
        await queryEngine.queryVoid(insertOrderQuery(false), {destination: `${sellerPod}/private/tests/my-offerings.ttl`});
    } catch (e) {
        console.error(e);
        return false;
    }

    return true;
}