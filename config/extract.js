import {sparqlEscapeUri} from 'mu';
import {querySudo as query} from "@lblod/mu-auth-sudo";
import {getPaymentInformationFromOrderId} from "../buy";
import {ensureTrailingSlash} from "../helper";

export default async function extractTriples(taskId) {
    const queryQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT ?orderId ?taskType
    FROM <http://mu.semte.ch/graphs/tasks>
    WHERE {
        ${sparqlEscapeUri(taskId)} a ext:Task;
            ext:taskType ?taskType;
            ext:taskStatus "pending";
            ext:order ?orderId.
    }`;

    const result = await query(queryQuery);
    const orderId = result.results?.bindings[0]?.orderId?.value;
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
