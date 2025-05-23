'use strict'

let log

function base64DecodeUint8Array(input) {
    return Uint8Array.from(window.atob(input), c => c.charCodeAt(0))
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

const contentType = 'video/mp4;codecs="avc1.64001f"'

async function checkRobustness(keySystem, robustness) {
    let available = false
    try {
        const a = await navigator.requestMediaKeySystemAccess(keySystem, [{
            initDataTypes: ['cenc'],
            videoCapabilities:[{contentType, robustness}]
        }])
        if (a)
            available = true
    }
    catch(e) {}

    return available
}

let keySystem = ''
let robustness = ''
let cencSuffix = ''
async function checkWidevine() {
    // check HW first
    keySystem = 'com.widevine.alpha'
    robustness = 'HW_SECURE_ALL'

    let available = await checkRobustness(keySystem, robustness)
    if (available)
        return

    // Widevine L1 can be available on Windows via com.widevine.alpha.experiment,
    // there's a gotcha though: it doesn't support AES-CBC (cbc/cbcs), so we have to
    // use AES-CTR (cenc) instead. The whole thing is a wrapper around PlayReady CDM,
    // that's why cenc is required.
    keySystem += '.experiment'
    available = await checkRobustness(keySystem, robustness)
    if (available) {
        cencSuffix = '-cenc'
        return
    }

    // and then SW
    keySystem = 'com.widevine.alpha'
    robustness = 'SW_SECURE_CRYPTO'
    available = await checkRobustness(keySystem, robustness)
    if (available)
        return

    keySystem = ''
    alert('Widevine not available')
}

function drmTodayCert() {
    const cert64 = `CrsCCAMSEKDc0WAwLAQT1SB2ogyBJEwYv4Tx7gUijgIwggEKAoIBAQC8Xc/GTRwZDtlnBThq8V382D1oJAM0F/YgCQtNDLz7vTWJ+QskNGi5Dd2qzO4s48Cnx5BLvL4H0xCRSw2Ed6ekHSdrRUwyoYOE+M/t1oIbccwlTQ7o+BpV1X6TB7fxFyx1jsBtRsBWphU65w121zqmSiwzZzJ4xsXVQCJpQnNI61gzHO42XZOMuxytMm0F6puNHTTqhyY3Z290YqvSDdOB+UY5QJuXJgjhvOUD9+oaLlvT+vwmV2/NJWxKqHBKdL9JqvOnNiQUF0hDI7Wf8Wb63RYSXKE27Ky31hKgx1wuq7TTWkA+kHnJTUrTEfQxfPR4dJTquE+IDLAi5yeVVxzbAgMBAAE6DGNhc3RsYWJzLmNvbUABEoADMmGXpXg/0qxUuwokpsqVIHZrJfu62ar+BF8UVUKdK5oYQoiTZd9OzK3kr29kqGGk3lSgM0/p499p/FUL8oHHzgsJ7Hajdsyzn0Vs3+VysAgaJAkXZ+k+N6Ka0WBiZlCtcunVJDiHQbz1sF9GvcePUUi2fM/h7hyskG5ZLAyJMzTvgnV3D8/I5Y6mCFBPb/+/Ri+9bEvquPF3Ff9ip3yEHu9mcQeEYCeGe9zR/27eI5MATX39gYtCnn7dDXVxo4/rCYK0A4VemC3HRai2X3pSGcsKY7+6we7h4IycjqtuGtYg8AbaigovcoURAZcr1d/G0rpREjLdVLG0Gjqk63Gx688W5gh3TKemsK3R1jV0dOfj3e6uV/kTpsNRL9KsD0v7ysBQVdUXEbJotcFz71tI5qc3jwr6GjYIPA3VzusD17PN6AGQniMwxJV12z/EgnUopcFB13osydpD2AaDsgWo5RWJcNf+fzCgtUQx/0Au9+xVm5LQBdv8Ja4f2oiHN3dw`
    return Uint8Array.from(window.atob(cert64), c => c.charCodeAt(0))
}

let env = ''
let merchant = ''
async function getLicense(event) {
    const hdRestrictions = {
        'WidevineM': {
            'minSL': 5,
            'requireHDCP': 'HDCP_V22'
        }
    }
    const crt = {
        'profile': {
            'purchase': {}
        },
        'outputProtection': {
            'digital': true,
            'analogue': true,
            'enforce': false
        },
        'op': {
            'config': {
                'HD': hdRestrictions,
                'UHD': hdRestrictions
            }
        }
    }
    let customDataObject = {sessionId: `crtjson:${JSON.stringify(crt)}`, merchant}

    const serializedCustomData = btoa(JSON.stringify(customDataObject))
    let headers = new Headers()
    headers.append('x-dt-custom-data', serializedCustomData)

    log.textContent += 'Requesting license\n'
    const request = new Request(
        `https://lic.${env}drmtoday.com/license-proxy-widevine/cenc/`,
        {
            method: 'POST',
            headers: headers,
            body: event.message
        }
    )
    let response = await fetch(request)
    if (!response.ok)
        throw new Error(`Requesting license failed with status ${response.status}`)
    let json = await response.json()
    console.log('License request response:', json)

    log.textContent += `Done, license status: ${json.status}\n`
    return base64DecodeUint8Array(json.license)
}

async function encrypted(event) {
    log.textContent += 'Got encrypted event\n'

    try {
        let initDataType = event.initDataType
        if (initDataType !== 'cenc')
            throw new Error(`Received unexpected initialization data type "${initDataType}"`)

        const initDataHex = Array.from(new Uint8Array(event.initData), x => x.toString(16).padStart(2, '0')).join('')
        if (!initDataHex.includes('edef8ba979d64acea3c827dcd51d21ed'))
            throw new Error('Unsupported DRM type (Widevine id not found)')

        let video = event.target
        if (!video.mediaKeys) {
            let access = await navigator.requestMediaKeySystemAccess(keySystem, [{
                initDataTypes: [initDataType],
                videoCapabilities: [{contentType, robustness}],
                sessionTypes: ['temporary']
            }])

            let keys = await access.createMediaKeys()
            await keys.setServerCertificate(drmTodayCert())
            await video.setMediaKeys(keys)
        }

        let initData = event.initData
        let session = video.mediaKeys.createSession()
        session.closed.then((reason) => {log.textContent += `DRM session closed, reason: "${reason}"\n`})
        session.generateRequest(initDataType, initData)

        let message = await waitFor(session, 'message')
        let response = await getLicense(message)
        await session.update(response)

        return session
    }
    catch(e) {
        log.textContent += `${e}\n`
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
    log = document.querySelector('span')

    const params = new URLSearchParams(window.location.search)
    if (params.has('stag'))
        env = 'staging.'
    if (params.has('merchant'))
        merchant = params.get('merchant')
    else {
        alert('Merchant ID is required')
        return
    }

    await checkWidevine()
    if (!keySystem) {
        alert('Widevine not available')
        return
    }
    log.textContent += `Using key system "${keySystem}" with robustness "${robustness}"\n`
    if (robustness !== 'HW_SECURE_ALL')
        log.textContent += 'HW-secure DRM is not available, loading low quality video\n'

    let video = document.querySelector('video')
    video.addEventListener('error', () => {log.textContent += `A video playback error occurred\n`}, false)

    log.textContent += 'Creating MediaSource\n'
    let mediaSource = new MediaSource
    video.src = URL.createObjectURL(mediaSource)
    await waitFor(mediaSource, 'sourceopen')

    let sourceBuffer = mediaSource.addSourceBuffer(contentType)
    await fetchAndWaitForEncrypted(video, sourceBuffer, `./meridian-${robustness === 'HW_SECURE_ALL' ? 480 : 160}-encr${cencSuffix}.mp4`)
    mediaSource.endOfStream()
}
