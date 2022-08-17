import {sparqlEscapeUri} from 'mu';
import {querySudo as query} from "@lblod/mu-auth-sudo";
import {ensureTrailingSlash} from "../helper";
import {getAuthFetchForWebId} from "../auth";

const MU_SPARQL_ENDPOINT = process.env.MU_SPARQL_ENDPOINT;

export default async function extractTriples(taskId, queryEngine) {
    const queryQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT ?orderId ?taskType ?pod ?webId
    FROM <http://mu.semte.ch/graphs/tasks>
    WHERE {
        ${sparqlEscapeUri(taskId)} a ext:Task;
            ext:taskType ?taskType;
            ext:taskStatus "pending".
        OPTIONAL { ${sparqlEscapeUri(taskId)} ext:order ?orderId. }
        OPTIONAL { ${sparqlEscapeUri(taskId)} ext:pod ?pod; ext:webId ?webId. }
    }`;

    const result = await query(queryQuery);
    const orderId = result.results?.bindings[0]?.orderId?.value;
    const pod = result.results?.bindings[0]?.pod?.value;
    const webId = result.results?.bindings[0]?.webId?.value;
    const taskType = result.results?.bindings[0]?.taskType?.value;

    if (taskType === 'http://mu.semte.ch/vocabularies/ext/SavedOrderTask') {
        const orderTriples = (await findOrderDetails(orderId)).results.bindings;

        const buyerPod = orderTriples.filter(triple => triple.p.value === 'http://mu.semte.ch/vocabularies/ext/buyerPod')[0].o.value;
        const sellerPod = orderTriples.filter(triple => triple.p.value === 'http://mu.semte.ch/vocabularies/ext/sellerPod')[0].o.value;
        const buyerWebId = orderTriples.filter(triple => triple.p.value === 'http://schema.org/customer')[0].o.value;
        const sellerWebId = orderTriples.filter(triple => triple.p.value === 'http://schema.org/seller')[0].o.value;

        return [{uri: `${buyerPod}private/tests/my-offerings.ttl`, webId: buyerWebId, insertTriples: orderTriples}, {
            uri: `${sellerPod}private/tests/my-offerings.ttl`,
            webId: sellerWebId,
            insertTriples: orderTriples
        }];
    } else if (taskType === 'http://mu.semte.ch/vocabularies/ext/UpdatedOrderTask') {
        const paymentInformation = await getPaymentInformationFromOrderId(orderId);
        const orderStatus = paymentInformation.results.bindings[0].orderStatus;
        const buyerPod = ensureTrailingSlash(paymentInformation.results.bindings[0].buyerPod.value);
        const sellerPod = ensureTrailingSlash(paymentInformation.results.bindings[0].sellerPod.value);
        const sellerWebId = paymentInformation.results.bindings[0].seller.value;
        const buyerWebId = paymentInformation.results.bindings[0].customer.value;
        const paymentId = paymentInformation.results.bindings[0].paymentId.value;

        const deleteTriples = [
            {
                s: {type: 'uri', value: orderId},
                p: {type: 'uri', value: 'http://schema.org/orderStatus'},
                o: {type: 'uri', value: 'http://schema.org/OrderPaymentDue'}
            },
            {
                s: {type: 'uri', value: orderId},
                p: {type: 'uri', value: 'http://mu.semte.ch/vocabularies/ext/buyerPod'},
                o: {type: 'literal', value: buyerPod}
            },
            {
                s: {type: 'uri', value: orderId},
                p: {type: 'uri', value: 'http://mu.semte.ch/vocabularies/ext/sellerPod'},
                o: {type: 'literal', value: sellerPod}
            }
        ];
        const insertTriples = [
            {
                s: {type: 'uri', value: orderId},
                p: {type: 'uri', value: 'http://schema.org/orderStatus'},
                o: orderStatus
            },
            {
                s: {type: 'uri', value: orderId},
                p: {type: 'uri', value: 'http://schema.org/paymentMethodId'},
                o: {type: 'literal', value: paymentId}
            }
        ];

        return [{uri: `${buyerPod}private/tests/my-offerings.ttl`, webId: buyerWebId, deleteTriples, insertTriples}, {
            uri: `${sellerPod}private/tests/my-offerings.ttl`,
            webId: sellerWebId,
            deleteTriples,
            insertTriples
        }];
    } else if (taskType === 'http://mu.semte.ch/vocabularies/ext/SyncOfferingsTask') {
        const authFetch = await getAuthFetchForWebId(webId);
        let triples = await queryPod(queryEngine, pod, authFetch);

        const oldOfferingTriples = (await getOldOfferingTriples(queryEngine, pod));

        // Add ext:pod triples for each subject.
        triples = triples.concat(triples.filter(triple => triple.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type').map(triple => ({
            subject: triple.subject,
            predicate: {value: 'http://mu.semte.ch/vocabularies/ext/pod', termType: 'NamedNode'},
            object: {value: pod, termType: 'NamedNode'}
        })));

        return [{graph: 'http://mu.semte.ch/graphs/public', deleteTriples: oldOfferingTriples, insertTriples: triples}];
    }
}

async function findOrderDetails(orderId) {
    const orderQuery = `
    PREFIX schema: <http://schema.org/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    CONSTRUCT {
        <${orderId}> a schema:Order;
            schema:acceptedOffer ?offer;
            schema:orderStatus ?orderStatus;
            schema:seller ?sellerWebId;
            schema:customer ?buyerWebId;
            schema:broker ?brokerWebId;
            schema:orderDate ?orderDate;
            ext:sellerPod ?sellerPod;
            ext:buyerPod ?buyerPod.
        ?offer a schema:Offer;
            schema:name ?offerName;
            schema:description ?offerDescription;
            schema:price ?price;
            schema:priceCurrency ?currency;
            schema:seller ?sellerWebId.
    }
    FROM <http://mu.semte.ch/application>
    WHERE {
        <${orderId}> a schema:Order;
            schema:acceptedOffer ?offer;
            schema:orderStatus ?orderStatus;
            schema:seller ?sellerWebId;
            schema:customer ?buyerWebId;
            schema:broker ?brokerWebId;
            schema:orderDate ?orderDate;
            ext:sellerPod ?sellerPod;
            ext:buyerPod ?buyerPod.
        ?offer a schema:Offer;
            schema:name ?offerName;
            schema:description ?offerDescription;
            schema:price ?price;
            schema:priceCurrency ?currency;
            schema:seller ?sellerWebId.
    }`;

    return query(orderQuery);
}

async function getPaymentInformationFromOrderId(orderId) {
    const queryQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX schema: <http://schema.org/>
    SELECT ?orderStatus ?buyerPod ?sellerPod ?paymentId ?seller ?customer
    FROM <http://mu.semte.ch/application>
    WHERE {
        <${orderId}> a schema:Order;
            schema:paymentMethodId ?paymentId;
            schema:orderStatus ?orderStatus;
            ext:sellerPod ?sellerPod;
            ext:buyerPod ?buyerPod;
            schema:seller ?seller;
            schema:customer ?customer.
    }`;

    return query(queryQuery);
}

async function queryPod(queryEngine, pod, authFetch) {
    return await (await queryEngine.queryQuads(`
  PREFIX gr: <http://purl.org/goodrelations/v1#>
  PREFIX schema: <http://schema.org/>
  CONSTRUCT {
    ?priceSpecification a gr:PriceSpecification;
        gr:hasCurrency ?currency;
        gr:hasCurrencyValue ?currencyValue.
    ?offering a gr:Offering;
        gr:name ?name;
        gr:description ?description;
        gr:includes ?product;
        gr:hasPriceSpecification ?priceSpecification.
    ?product a gr:ProductOrService;
        gr:name ?productName;
        gr:description ?productDescription;
        schema:image ?image.
    ?seller a gr:BusinessEntity;
        gr:legalName ?sellerLegalName;
        gr:description ?sellerWebId;
        gr:offers ?offering.
  }
  WHERE {
    ?priceSpecification a gr:PriceSpecification;
        gr:hasCurrency ?currency;
        gr:hasCurrencyValue ?currencyValue.
    ?offering a gr:Offering;
        gr:name ?name;
        gr:description ?description;
        gr:includes ?product;
        gr:hasPriceSpecification ?priceSpecification.
    ?product a gr:ProductOrService;
        gr:name ?productName;
        gr:description ?productDescription;
        schema:image ?image.
    ?seller a gr:BusinessEntity;
        gr:legalName ?sellerLegalName;
        gr:description ?sellerWebId;
        gr:offers ?offering.
  }
  `, {
        sources: [`${pod}private/tests/my-offerings.ttl`, `${pod}private/tests/my-products.ttl`],
        fetch: authFetch
    })).toArray();
}

async function getOldOfferingTriples(queryEngine, pod) {
    const queryTriples = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    CONSTRUCT FROM <http://mu.semte.ch/graphs/public>
    WHERE {
        ?s ext:pod ${sparqlEscapeUri(pod)};
            ?p ?o.
    }`;

    // Uses Comunica, as sparql-client does not support CONSTRUCT WHERE.
    // Also gives us the advantage that the output format is the same as the queryPod function.
    return await (await queryEngine.queryQuads(queryTriples, {
        sources: [{
            type: 'sparql',
            value: MU_SPARQL_ENDPOINT
        }]
    })).toArray();
}
