function uInt8ArrayToString(array) {
    return String.fromCharCode.apply(null, array)
}

function uInt8ArrayToHex(arr) {
    let hex = ''
    for (const a of arr) {
        let value = a.toString(16)
        if (value.length == 1)
            value = '0' + value

        hex += value
    }
    return hex
}

function stringToUInt8Array(str)
{
    return Uint8Array.from(str, c => c.charCodeAt(0))
}

function base64DecodeUint8Array(input) {
    return Uint8Array.from(window.atob(input), c => c.charCodeAt(0))
}

function base64DecodeUint8Array2(input) {
    return Uint8Array.from(input)
}

function base64EncodeUint8Array(input) {
    return btoa(uInt8ArrayToString(input))
}

function waitFor(target, type) {
    return new Promise(resolve => {
        target.addEventListener(type, resolve, { once: true })
    })
}

async function fetchBuffer(url) {
    let result = await fetch(url)
    let buffer = await result.arrayBuffer()
    return buffer
}

async function fetchAndAppend(sourceBuffer, url) {
    let buffer = await fetchBuffer(url)
    sourceBuffer.appendBuffer(buffer)
    await waitFor(sourceBuffer, 'updateend')
}

function drmTodayCert() {
    const cert64 = `CrsCCAMSEKDc0WAwLAQT1SB2ogyBJEwYv4Tx7gUijgIwggEKAoIBAQC8Xc/GTRwZDtlnBThq8V382D1oJAM0F/YgCQtNDLz7vTWJ+QskNGi5Dd2qzO4s48Cnx5BLvL4H0xCRSw2Ed6ekHSdrRUwyoYOE+M/t1oIbccwlTQ7o+BpV1X6TB7fxFyx1jsBtRsBWphU65w121zqmSiwzZzJ4xsXVQCJpQnNI61gzHO42XZOMuxytMm0F6puNHTTqhyY3Z290YqvSDdOB+UY5QJuXJgjhvOUD9+oaLlvT+vwmV2/NJWxKqHBKdL9JqvOnNiQUF0hDI7Wf8Wb63RYSXKE27Ky31hKgx1wuq7TTWkA+kHnJTUrTEfQxfPR4dJTquE+IDLAi5yeVVxzbAgMBAAE6DGNhc3RsYWJzLmNvbUABEoADMmGXpXg/0qxUuwokpsqVIHZrJfu62ar+BF8UVUKdK5oYQoiTZd9OzK3kr29kqGGk3lSgM0/p499p/FUL8oHHzgsJ7Hajdsyzn0Vs3+VysAgaJAkXZ+k+N6Ka0WBiZlCtcunVJDiHQbz1sF9GvcePUUi2fM/h7hyskG5ZLAyJMzTvgnV3D8/I5Y6mCFBPb/+/Ri+9bEvquPF3Ff9ip3yEHu9mcQeEYCeGe9zR/27eI5MATX39gYtCnn7dDXVxo4/rCYK0A4VemC3HRai2X3pSGcsKY7+6we7h4IycjqtuGtYg8AbaigovcoURAZcr1d/G0rpREjLdVLG0Gjqk63Gx688W5gh3TKemsK3R1jV0dOfj3e6uV/kTpsNRL9KsD0v7ysBQVdUXEbJotcFz71tI5qc3jwr6GjYIPA3VzusD17PN6AGQniMwxJV12z/EgnUopcFB13osydpD2AaDsgWo5RWJcNf+fzCgtUQx/0Au9+xVm5LQBdv8Ja4f2oiHN3dw`
    return Uint8Array.from(window.atob(cert64), c => c.charCodeAt(0))
}

let env = ''
let merchant = ''
async function getLicense(event) {
    let crt = {
        'profile': {
            'purchase': {}
        },
        'outputProtection': {
            'digital': true,
            'analogue': true,
            'enforce': false
        }
    }
    let customDataObject = {sessionId: `crtjson:${JSON.stringify(crt)}`, merchant}

    const serializedCustomData = btoa(JSON.stringify(customDataObject))
    let headers = new Headers()
    headers.append('x-dt-custom-data', serializedCustomData)

    document.querySelector('span').textContent += 'Requesting license\n'
    const request = new Request(
        `https://lic.${env}drmtoday.com/license-proxy-widevine/cenc/`,
        {
            method: 'POST',
            headers: headers,
            body: event.message
        }
    )
    let response = await fetch(request)
    let json = await response.json()
    console.log('License request response:', json)

    document.querySelector('span').textContent += `Done, license status: ${json.status}\n`
    return base64DecodeUint8Array(json.license)
}

function onerror(event) {
    console.log('A video playback error occurred', event)
    alert('A video playback error occurred')
}

async function encrypted(event) {
    document.querySelector('span').textContent += 'Got encrypted event\n'

    try {
        let initDataType = event.initDataType
        if (initDataType !== 'cenc') {
            alert(`Received unexpected initialization data type "${initDataType}"`)
            return
        }

        const initDataHex = uInt8ArrayToHex(new Uint8Array(event.initData))
        console.log('initDataHex', initDataHex)
        if (initDataHex.indexOf('edef8ba979d64acea3c827dcd51d21ed') == -1) {
            alert('Unexpected DRM type (not Widevine)')
            return
        }

        let video = event.target
        if (!video.mediaKeys) {
            let access = await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
                initDataTypes: [initDataType],
                videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.64001f"', robustness: 'SW_SECURE_CRYPTO' }],
                sessionTypes: ['temporary']
            }])

            let keys = await access.createMediaKeys()
            await keys.setServerCertificate(drmTodayCert())
            await video.setMediaKeys(keys)
        }

        let initData = event.initData
        let session = video.mediaKeys.createSession()
        session.generateRequest(initDataType, initData)

        let message = await waitFor(session, 'message')
        let response = await getLicense(message)
        await session.update(response)

        return session
    } catch(e) {
        alert(`Could not start encrypted playback due to exception "${e}"`)
    }
}

async function fetchAndWaitForEncrypted(video, sourceBuffer, url) {
    let updateEndPromise = fetchAndAppend(sourceBuffer, url)
    let event = await waitFor(video, 'encrypted')
    let session = await encrypted(event)
    await updateEndPromise
    return session
}

window.onload = async function() {
    const params = new URLSearchParams(window.location.search)
    if (params.has('stag'))
        env = 'staging.'
    if (params.has('merchant'))
        merchant = params.get('merchant')
    else {
        alert('Merchant ID is required')
        return
    }

    let video = document.querySelector('video')
    video.addEventListener('error', onerror, false)

    document.querySelector('span').textContent += 'Creating MediaSource\n'

    let mediaSource = new MediaSource
    video.src = URL.createObjectURL(mediaSource)
    await waitFor(mediaSource, 'sourceopen')

    let sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.64001f"')
    await fetchAndWaitForEncrypted(video, sourceBuffer, './meridian-480-encr.mp4')
}
