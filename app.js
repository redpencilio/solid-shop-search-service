import {app, errorHandler} from 'mu';
import {QueryEngine} from '@comunica/query-sparql';
import {queryPod, deleteOld, insert} from './sync';
import {queryDatabase} from './query';
import {
    checkPayment,
    confirmPayment,
    findOfferingDetails,
    getMollieApiKey, getPaymentInformationFromPaymentId,
    handlePayment,
    saveOrder,
    storeMollieApiKey
} from "./buy";
import {getSales} from "./sales";
import {getPurchases} from "./purchases";

const queryEngine = new QueryEngine();
const brokerWebId = process.env.BROKER_WEB_ID;

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

    const apiKeyResult = await getMollieApiKey(offering.sellerWebId.value);
    if (!Array.isArray(apiKeyResult.results.bindings) || !apiKeyResult.results.bindings.length) {
        res.status(400).send('Seller did not provide payment configuration');
    }
    const apiKey = apiKeyResult.results.bindings[0].mollieApiKey.value;

    const payment = await handlePayment(offering.name.value, offering.currencyValue.value, apiKey);

    await saveOrder(queryEngine, offering, buyerPod, sellerPod, buyerWebId, offering.sellerWebId.value, brokerWebId, payment.id);

    res.redirect(payment.getCheckoutUrl());
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

app.post('/buy/callback', async (req, res) => {
    const paymentId = req.body.id;
    if (paymentId === undefined) {
        res.status(400).send('Missing payment id');
        return;
    }

    const apiKeyQuery = await getPaymentInformationFromPaymentId(paymentId);
    if (!Array.isArray(apiKeyQuery.results.bindings) || apiKeyQuery.results.bindings.length === 0) {
        throw new Error('No API key found for payment. How was the payment initiated?');
    }
    const mollieApiKey = apiKeyQuery.results.bindings[0].mollieApiKey.value;
    const buyerPod = apiKeyQuery.results.bindings[0].buyerPod.value;
    const sellerPod = apiKeyQuery.results.bindings[0].sellerPod.value;
    const orderId = apiKeyQuery.results.bindings[0].order.value;

    const isPaid = await checkPayment(paymentId, mollieApiKey);
    // Only paid statuses are handled for now.
    if (isPaid) {
        if (await confirmPayment(queryEngine, buyerPod, sellerPod, orderId)) {
            res.send('OK');
        } else {
            res.status(500).send('Payment confirmation failed');
        }
    } else {
        // For security reasons, we don't want to leak information about an unknown payment id.
        res.send('OK');
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

app.use(errorHandler);
