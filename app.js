import {app, errorHandler} from 'mu';
import {QueryEngine} from '@comunica/query-sparql';
import {queryPod, deleteOld, insert} from './sync';
import {queryDatabase} from './query';
import {
    findOfferingDetails,
    getPaymentInformationFromPaymentId,
    saveOrder,
    storeMollieApiKey, updateOrder
} from "./buy";
import {getSales} from "./sales";
import {getPurchases} from "./purchases";
import bodyParser from 'body-parser';
import {getAuthFetchForWebId, saveCSSCredentials} from "./auth-css";

const queryEngine = new QueryEngine();
const brokerWebId = process.env.BROKER_WEB_ID;

app.post('/sync', async (req, res) => {
    const pod = req.body.pod;
    if (pod === undefined) {
        res.status(400).send('Missing pod');
        return;
    }
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

    const orderInfo = await saveOrder(queryEngine, offering, buyerPod, sellerPod, buyerWebId, offering.sellerWebId.value, brokerWebId);

    res.send(JSON.stringify(orderInfo));
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

app.post('/buy/callback', bodyParser.json(), async (req, res) => {
    const paymentId = req.body.paymentId;
    if (paymentId === undefined) {
        res.status(400).send('Missing payment id');
        return;
    }

    console.log('Payment callback for payment id ' + paymentId);
    const paymentInformation = await getPaymentInformationFromPaymentId(paymentId);
    if (!Array.isArray(paymentInformation.results.bindings) || paymentInformation.results.bindings.length === 0) {
        throw new Error(`No payment information found for payment ID '${paymentId}'.`);
    }
    const orderStatus = paymentInformation.results.bindings[0].orderStatus.value;
    const buyerPod = paymentInformation.results.bindings[0].buyerPod.value;
    const sellerPod = paymentInformation.results.bindings[0].sellerPod.value;
    const orderId = paymentInformation.results.bindings[0].order.value;
    const sellerWebId = paymentInformation.results.bindings[0].seller.value;
    const buyerWebId = paymentInformation.results.bindings[0].customer.value;
    console.log(`Order status is '${orderStatus}'.`);

    if (await updateOrder(queryEngine, orderStatus, buyerPod, sellerPod, orderId, paymentId, sellerWebId, buyerWebId)) {
        res.send('OK');
    } else {
        res.status(500).send('Order update failed');
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
    if (IDPType === 'css') {
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
    }
});

app.use(errorHandler);
