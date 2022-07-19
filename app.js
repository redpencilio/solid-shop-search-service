import {app, errorHandler} from 'mu';
import {QueryEngine} from '@comunica/query-sparql';
import {queryPod, deleteOld, insert} from './sync';
import {queryDatabase} from './query';

const queryEngine = new QueryEngine();

app.post('/sync', async (req, res) => {
    const pod = req.body.pod;
    if (pod === undefined) {
        res.status(400).send('Missing pod');
        return;
    }

    const quads = await queryPod(queryEngine, pod);

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

app.use(errorHandler);
