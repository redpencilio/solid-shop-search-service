import {app, errorHandler} from 'mu';
import {QueryEngine} from '@comunica/query-sparql';
import {queryPod, deleteOld, insert} from './sync';
import {queryDatabase} from './query';
import {findOfferingDetails, handlePayment, saveOrder} from "./buy";

const queryEngine = new QueryEngine();
const brokerWebId = 'https://broker.mu/'; // TODO: change to real broker web id

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

app.post('/buy', async (req, res) => {
    const buyerPod = req.body.buyerPod;
    if (buyerPod === undefined) {
        res.status(400).send('Missing buyerPod');
        return;
    }
    const buyerWebId = req.body.buyerWebId;
    if (buyerWebId === undefined) {
        res.status(400).send('Missing buyerWebId');
        return;
    }
    const sellerPod = req.body.sellerPod;
    if (sellerPod === undefined) {
        res.status(400).send('Missing sellerPod');
        return;
    }
    const offeringId = req.body.offeringId;
    if (offeringId === undefined) {
        res.status(400).send('Missing offeringId');
        return;
    }

    const offerings = await findOfferingDetails(buyerPod, sellerPod, offeringId);
    if (!Array.isArray(offerings.results.bindings) || !offerings.results.bindings.length) {
        res.status(404).send('Offering not found');
        return;
    }
    const offering = offerings.results.bindings[0];

    if (!handlePayment(offering.name.value, offering.currencyValue.value)) {
        res.status(400).send('Payment failed');
        return;
    }

    const orderDetails = await saveOrder(queryEngine, offering, buyerPod, sellerPod, buyerWebId, offering.sellerWebId.value, brokerWebId)
    if (orderDetails) {
        res.send(JSON.stringify(orderDetails));
    } else {
        res.status(500).send('Order failed');
    }
});

app.use(errorHandler);
