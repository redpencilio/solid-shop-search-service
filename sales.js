import {query} from 'mu';

export async function getSales(sellerWebId) {
    const salesQuery = `
    PREFIX schema: <http://schema.org/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    SELECT ?orderDate ?orderStatus ?offerName ?offerDescription ?offerPrice ?offerCurrency ?customerWebId
    FROM <http://mu.semte.ch/application>
    WHERE {
        ?order a schema:Order;
            schema:seller "${sellerWebId}";
            schema:orderStatus ?orderStatus;
            schema:orderDate ?orderDate;
            schema:acceptedOffer ?offer;
            schema:customer ?customerWebId.
            
        ?offer a schema:Offer;
            schema:name ?offerName;
            schema:description ?offerDescription;
            schema:price ?offerPrice;
            schema:priceCurrency ?offerCurrency.
    }`;

    return query(salesQuery);
}
