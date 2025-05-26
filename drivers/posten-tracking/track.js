const axios = require('axios');

async function track(trackingNumber) {
    try {
        const response = await axios.get(`https://sporing.posten.no/tracking/api/fetch?query=${trackingNumber}&lang=no`);
        const consignmentSet = response?.data?.consignmentSet;
        if (response.status !== 200 || typeof consignmentSet[0] === 'undefined') {
            throw new Error(consignmentSet[0].error.code);
        } else {
            console.log(response.data);
            console.log(`${response.status} OK`);
            console.log(consignmentSet[0].packageSet[0]);
        }
    } catch (error) {
        console.error(`Fant ingen sporingsinformasjon for sporingsnummer: ${trackingNumber}. Feilmelding: ${error.message}`);
        return false;
    }
}

async function tryLogin() {
    try {
        const response = await axios.get(`https://id.posten.no/minside/`);
        const data = response.data;
        console.log(response);
    } catch (error) {
        console.error(error.message);
    }
}

async function getLogin() {
    try {
        const response = await axios.get(`https://id.posten.no/minside`);
        const htmlData = response.data;
        if (response.request.path && response.request.path.length > 1) {
            const csrfToken = await getCsrfToken(htmlData);
            const checkApiResponse = await checkApiSession(response.request.path, response.headers['set-cookie']);
            const cookies = checkApiResponse.headers['set-cookie'];
            const postLoginResponse = await postLogin(csrfToken, cookies);
            //console.log(postLoginResponse);

            const code = response.request.path.replace('/login/', '');
            await authorizeLogin(code, cookies);
        }
    } catch (error) {
        console.error(`An error occurred during login: ${error.message}`);
        return false;
    }
}

async function getCsrfToken(htmlData) {
    const match = htmlData.match(/window\.csrfToken = '(.+?)';/);
    if (match && match.length > 1) {
        return match[1];
    }
    throw new Error('CSRF-token not found in HTML data');
}

async function checkApiSession(path, cookies) {
    try {
        const response = await axios.get(`https://id.posten.no${path}`, { headers: { 'Cookie': cookies } });
        return response;
    } catch (error) {
        throw new Error(`Failed to check API session: ${error.message}`);
    }
}

async function postLogin(csrfToken, cookies) {
    const url = 'https://id.posten.no/api/session/validate-and-create-sms-code';
    const headers = {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Cookie': cookies,
        'Origin': 'https://id.posten.no',
        'Referer': 'https://id.posten.no',
        'X-CSRF-Token': csrfToken
    };
    const data = {
        phoneNumber: '+4746237980',
        password: 'burlroad50'
    };

    console.log(JSON.stringify(PhoneNumberPassword));

    try {
        const response = await axios.post(url, data, { headers });
        return response;
    } catch (error) {
        throw new Error(`Failed to post login: ${error.message}`);
    }
}

async function authorizeLogin(code, cookies) {
    const url = `https://id.posten.no/api/oauth/authorizations/authorize/${code}`;

    const headers = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Cookie': cookies,
        'Referer': `https://id.posten.no/login/${code}`
    };

    try {
        const response = await axios.get(url, { headers, responseType: 'json' });
        console.log(response);
        console.log(response.headers.location);
        // Gjør noe med svaret etter behov
    } catch (error) {
        console.error(`Failed to authorize login: ${error.message}`);
    }
}

getLogin();
//tryLogin();