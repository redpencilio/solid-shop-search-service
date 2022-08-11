import {app, errorHandler} from 'mu';
import {QueryEngine} from '@comunica/query-sparql';
import {deleteOld, insert, queryPod} from './sync';
import {queryDatabase} from './query';
import {storeMollieApiKey, updatePods} from "./buy";
import {getSales} from "./sales";
import {getPurchases} from "./purchases";
import {saveCSSCredentials} from "./auth-css";
import {getAuthFetchForWebId} from "./auth";
import {authApplicationWebIdESS, saveESSCredentials} from "./auth-ess";
import cookieSession from "cookie-session";
import {ensureTrailingSlash} from "./helper";
import {discoverPendingTasks, setTaskStatus} from "./config/tasks";
import extractTriples from "./config/extract";

const queryEngine = new QueryEngine();

/**
 * @enum {TaskStatus}
 */
export const TaskStatus = {
    PENDING: 'pending',
    DONE: 'done',
    FAILED: 'failed'
}

app.use(cookieSession({
    name: 'session',
    keys: ['key1', 'key2'],
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

app.post('/sync', async (req, res) => {
    let pod = req.body.pod;
    if (pod === undefined) {
        res.status(400).send('Missing pod');
        return;
    }
    pod = ensureTrailingSlash(pod);
    const webId = req.body.webId;
    if (webId === undefined) {
        res.status(400).send('Missing webId');
        return;
    }

    const authFetch = await getAuthFetchForWebId(webId);
    const quads = await queryPod(queryEngine, pod, authFetch);

    await deleteOld(pod);

    insert(quads, pod)
        .then(function (response) {
            res.send(JSON.stringify(response));
        })
        .catch(function (err) {
            res.send("Oops something went wrong: " + JSON.stringify(err));
        });
});

app.get('/query', async (req, res) => {
    const offerings = await queryDatabase(req.query.name, req.query.description, req.query.seller);

    res.send(JSON.stringify(offerings));
});

app.post('/delta', async (req, res) => {
    // A new order created task was created, check the tasks to find the details.
    const tasks = await discoverPendingTasks();

    if (Array.isArray(tasks.results.bindings) && tasks.results.bindings.length) {
        for (const task of tasks.results.bindings) {
            const orderTriples = await extractTriples(task.task.value);
            let succeeded;
            try {
                await updatePods(queryEngine, orderTriples);
                succeeded = true;
            } catch (_) {
                succeeded = false;
            }
            await setTaskStatus(task.task.value, succeeded ? TaskStatus.DONE : TaskStatus.FAILED);
        }
    }

    res.send('OK');
});


app.post('/buy/key', async (req, res) => {
    const sellerWebId = decodeURIComponent(req.body.sellerWebId);
    if (sellerWebId === undefined) {
        res.status(400).send('Missing sellerWebId');
        return;
    }
    const apiKey = req.body.apiKey;
    if (apiKey === undefined) {
        res.status(400).send('Missing apiKey');
        return;
    }

    if (await storeMollieApiKey(sellerWebId, apiKey)) {
        res.send('API key stored');
    } else {
        res.status(500).send('API key not stored');
    }
});

app.get('/sales', async (req, res) => {
    const sellerWebId = decodeURIComponent(req.query.sellerWebId);
    if (sellerWebId === undefined) {
        res.status(400).send('Missing sellerWebId');
        return;
    }

    const sales = await getSales(sellerWebId);

    res.send(JSON.stringify(sales));
});

app.get('/purchases', async (req, res) => {
    const buyerWebId = decodeURIComponent(req.query.buyerWebId);
    if (buyerWebId === undefined) {
        res.status(400).send('Missing buyerWebId');
        return;
    }

    const purchases = await getPurchases(buyerWebId);

    res.send(JSON.stringify(purchases));
});

app.post('/profile/credentials', async (req, res) => {
    const IDPType = decodeURIComponent(req.body.idpType);
    if (IDPType === undefined) {
        res.status(400).send('Missing IDPType');
        return;
    }
    const clientWebId = decodeURIComponent(req.body.clientWebId);
    if (clientWebId === undefined) {
        res.status(400).send('Missing clientWebId');
        return;
    }
    if (IDPType === 'css') {
        const clientId = decodeURIComponent(req.body.clientId);
        if (clientId === undefined) {
            res.status(400).send('Missing clientId');
            return;
        }
        const clientSecret = decodeURIComponent(req.body.clientSecret);
        if (clientSecret === undefined) {
            res.status(400).send('Missing clientSecret');
            return;
        }
        const IDPUrl = decodeURIComponent(req.body.idpUrl);
        if (IDPUrl === undefined) {
            res.status(400).send('Missing IDPURL');
            return;
        }

        if (await saveCSSCredentials(clientWebId, clientId, clientSecret, IDPUrl)) {
            res.send('Credentials stored');
        } else {
            res.status(500).send('Something went wrong while storing credentials');
        }
    } else if (IDPType === 'ess') {
        if (await saveESSCredentials(clientWebId)) {
            res.send('Credentials stored');
        } else {
            res.status(500).send('Something went wrong while storing credentials');
        }
    } else {
        res.status(400).send('Unknown IDP type');
    }
});

app.get('/auth/ess/webId', async (req, res) => {
    res.send(JSON.stringify({webId: authApplicationWebIdESS}));
});

app.use(errorHandler);
