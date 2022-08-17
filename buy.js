import {updateSudo as update} from '@lblod/mu-auth-sudo';
import {getAuthFetchForWebId} from "./auth";
import {constructTermToString, objectToString} from "./helper";
import {sparqlEscapeUri} from 'mu';

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

/**
 * Update the triple store database.
 *
 * @param data: [{graph, deleteTriples: [ { subject: {value, termType}, predicate: {value, termType}, object: {value, termType} } ], insertTriples }, ...]
 * In case of termType === 'Literal', it can have an additional property 'dataType': {value}.
 */
export async function updateDatabase(data) {
    const deletePromises = [];
    const insertPromises = [];

    for (const {graph, deleteTriples, insertTriples} of data) {
        if (deleteTriples?.length > 0) {
            const triplesString = deleteTriples.map(triple => `${objectToString(triple.subject)} ${objectToString(triple.predicate)} ${objectToString(triple.object)}.`).join('\n')
            const queryString = `DELETE DATA { GRAPH ${sparqlEscapeUri(graph)} { ${triplesString} } }`;
            deletePromises.push(update(queryString));
        }

        if (insertTriples?.length > 0) {
            const triplesString = insertTriples.map(triple => `${objectToString(triple.subject)} ${objectToString(triple.predicate)} ${objectToString(triple.object)}.`).join('\n')
            const queryString = `INSERT DATA { GRAPH ${sparqlEscapeUri(graph)} { ${triplesString} } }`;
            insertPromises.push(update(queryString));
        }
    }

    await Promise.all(deletePromises);
    await Promise.all(insertPromises);
}
