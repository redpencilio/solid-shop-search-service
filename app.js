import {app, errorHandler} from 'mu';
import {QueryEngine} from '@comunica/query-sparql';
import {updateDatabase, updatePods} from "./sync";
import {saveCSSCredentials} from "./auth-css";
import {authApplicationWebIdESS, saveESSCredentials} from "./auth-ess";
import cookieSession from "cookie-session";
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

app.post('/delta', async (req, res) => {
    const tasks = await discoverPendingTasks();

    if (Array.isArray(tasks.results.bindings) && tasks.results.bindings.length) {
        for (const task of tasks.results.bindings) {
            const triples = await extractTriples(task.task.value, queryEngine);
            let succeeded;
            try {
                if (task.dataFlow.value === 'http://mu.semte.ch/vocabularies/ext/DbToPod') {
                    await updatePods(queryEngine, triples);
                    succeeded = true;
                } else if (task.dataFlow.value === 'http://mu.semte.ch/vocabularies/ext/PodToDb') {
                    await updateDatabase(triples);
                    succeeded = true;
                } else {
                    console.error(`Unknown data flow: ${task.dataFlow.value}`);
                    succeeded = false;
                }
            } catch (_) {
                succeeded = false;
            }
            await setTaskStatus(task.task.value, succeeded ? TaskStatus.DONE : TaskStatus.FAILED);
        }
    }

    res.send('OK');
});

app.post('/auth/credentials', async (req, res) => {
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
