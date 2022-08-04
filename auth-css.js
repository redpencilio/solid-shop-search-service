import {buildAuthenticatedFetch, createDpopHeader, generateDpopKeyPair} from '@inrupt/solid-client-authn-core';
import {querySudo as query, updateSudo as update} from '@lblod/mu-auth-sudo';
import fetch from 'node-fetch';

export async function saveCSSCredentials(clientWebId, clientId, clientSecret, IDPUrl) {
    const queryDelete = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    DELETE { GRAPH <http://mu.semte.ch/application> {
        <${clientWebId}> ext:clientId ?clientId;
            ext:clientSecret ?clientSecret;
            ext:IDPUrl ?IDPUrl;
            ext:IDPType ?IDPType.
    } }
    WHERE {
        <${clientWebId}> ext:IDPType ?IDPType.
        OPTIONAL { <${clientWebId}> ext:clientId ?clientId;
            ext:clientSecret ?clientSecret;
            ext:IDPUrl ?IDPUrl. 
        }
    }`;

    const queryInsert = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    INSERT DATA { GRAPH <http://mu.semte.ch/application> {
        <${clientWebId}> ext:clientId "${clientId}";
            ext:clientSecret "${clientSecret}";
            ext:IDPUrl "${IDPUrl}";
            ext:IDPType "css".   
    } }`;

    await update(queryDelete);
    return await update(queryInsert);
}

export async function getCSSCredentials(clientWebId) {
    const queryQuery = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT ?clientId ?clientSecret ?IDPUrl
    FROM <http://mu.semte.ch/application>
    WHERE {
        <${clientWebId}> ext:clientId ?clientId;
            ext:clientSecret ?clientSecret;
            ext:IDPUrl ?IDPUrl;
            ext:IDPType "css".
    }`;

    return query(queryQuery);
}

export async function requestAccessToken(clientId, clientSecret, IDPUrl) {
    const dpopKey = await generateDpopKeyPair();
    const authString = `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`;
    const tokenUrl = `${IDPUrl}/.oidc/token`;

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            authorization: `Basic ${Buffer.from(authString).toString('base64')}`,
            'content-type': 'application/x-www-form-urlencoded',
            dpop: await createDpopHeader(tokenUrl, 'POST', dpopKey),
        },
        body: 'grant_type=client_credentials&scope=webid',
    });

    const {access_token: accessToken} = await response.json();

    return {accessToken, dpopKey};
}

export async function getAuthFetch(dpopKey, accessToken) {
    return await buildAuthenticatedFetch(fetch, accessToken, {dpopKey});
}

export async function getAuthFetchForWebId(clientWebId) {
    const credentialsQuery = await getCSSCredentials(clientWebId);
    if (!Array.isArray(credentialsQuery.results.bindings) || credentialsQuery.results.bindings.length === 0) {
        throw new Error('No credentials found for this web id');
    }
    const credentials = credentialsQuery.results.bindings[0];

    const {
        accessToken,
        dpopKey
    } = await requestAccessToken(credentials.clientId.value, credentials.clientSecret.value, credentials.IDPUrl.value);

    return await getAuthFetch(dpopKey, accessToken);
}
