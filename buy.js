import {querySudo as query, updateSudo as update} from '@lblod/mu-auth-sudo';
import {getAuthFetchForWebId} from "./auth";
import {constructTermToString} from "./helper";

export async function storeMollieApiKey(sellerWebId, apiKey) {
    const queryDelete = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    DELETE { GRAPH <http://mu.semte.ch/application> {
        <${sellerWebId}> ext:mollieApiKey ?mollieApiKey.
    } }
    WHERE {
        <${sellerWebId}> ext:mollieApiKey ?mollieApiKey.
    }`;

    const queryInsert = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    INSERT DATA { GRAPH <http://mu.semte.ch/application> {
        <${sellerWebId}> ext:mollieApiKey "${apiKey}".
    } }`;

    await update(queryDelete);
    return await update(queryInsert);
}

export async function getPaymentInformationFromOrderId(orderId) {
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

/**
 * Update the PODs.
 *
 * @param queryEngine
 * @param data: [{uri, webId, deleteTriples: [ { s: {value, type}, p: {value, type}, o: {value, type} } ], insertTriples }, ...]
 */
export async function updatePods(queryEngine, data) {
    const deletePromises = [];
    const insertPromises = [];
    for (const {uri, webId, deleteTriples, insertTriples} of data) {
        const authFetch = await getAuthFetchForWebId(webId);

        if (deleteTriples?.length > 0) {
            const triplesString = deleteTriples.map(triple => `${constructTermToString(triple.s)} ${constructTermToString(triple.p)} ${constructTermToString(triple.o)}.`).join('\n')
            const query = `DELETE DATA { ${triplesString} }`;
            deletePromises.push(queryEngine.queryVoid(query, {destination: uri, fetch: authFetch}));
        }

        if (insertTriples?.length > 0) {
            const triplesString = insertTriples.map(triple => `${constructTermToString(triple.s)} ${constructTermToString(triple.p)} ${constructTermToString(triple.o)}.`).join('\n')
            const query = `INSERT DATA { ${triplesString} }`;
            insertPromises.push(queryEngine.queryVoid(query, {destination: uri, fetch: authFetch}));
        }
    }
    await Promise.all(deletePromises);
    await Promise.all(insertPromises);
}
