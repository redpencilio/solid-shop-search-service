import {querySudo as query} from '@lblod/mu-auth-sudo';
import {getAuthFetchForWebId as getAuthFetchForWebIdCSS} from "./auth-css";
import {authFetchESS} from "./auth-ess";

export async function getIdpType(webId) {
    const queryQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT ?IDPType
    FROM <http://mu.semte.ch/application>
    WHERE {
        <${webId}> ext:IDPType ?IDPType.
    }`;

    const result = await query(queryQuery);
    if (!Array.isArray(result.results.bindings) || result.results.bindings.length === 0) {
        return undefined;
    }

    return result.results.bindings[0].IDPType.value;
}

export async function getAuthFetchForWebId(webId) {
    const idpType = await getIdpType(webId);
    if (!idpType) {
        throw new Error('No credentials found for this web id');
    }

    switch (idpType) {
        case 'css':
            return getAuthFetchForWebIdCSS(webId);
        case 'ess':
            return authFetchESS;
        default:
            throw new Error(`Unknown IDP type: ${idpType}`);
    }
}
