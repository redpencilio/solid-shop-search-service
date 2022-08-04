import {Session} from "@inrupt/solid-client-authn-node";
import {updateSudo as update} from "@lblod/mu-auth-sudo";

const essClientId = process.env.ESS_CLIENT_ID;
const essClientSecret = process.env.ESS_CLIENT_SECRET;
const essIDP = process.env.ESS_IDP;

const session = new Session();
export let authFetchESS = undefined;
export let authApplicationWebIdESS = undefined;
session.login({
    clientId: essClientId,
    clientSecret: essClientSecret,
    oidcIssuer: essIDP,
}).then(() => {
    if (session.info.isLoggedIn) {
        authFetchESS = session.fetch;
        authApplicationWebIdESS = session.info.webId;
    }
});

export async function saveESSCredentials(clientWebId) {
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
        <${clientWebId}> ext:IDPType "ess".
    } }`;

    await update(queryDelete);
    return await update(queryInsert);
}
