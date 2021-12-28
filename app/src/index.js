const base64 = require('base64-js')
const encryptionSDK = require('@aws-crypto/client-node')

const { decrypt } = encryptionSDK.buildClient(
    encryptionSDK.CommitmentPolicy.REQUIRE_ENCRYPT_ALLOW_DECRYPT
)
const generatorKeyId = process.env.KEY_ALIAS
const keyIds = [process.env.KEY_ID]
const keyring = new encryptionSDK.KmsKeyringNode({ generatorKeyId, keyIds })

const sendgrid = require('@sendgrid/mail')
sendgrid.setApiKey(process.env.SENDGRID_API_KEY)

/**
 * CustomEmailSender for Cognito UserPool
 *
 * @see https://docs.aws.amazon.com/ja_jp/cognito/latest/developerguide/user-pool-lambda-custom-email-sender.html
 * @param event {import("@types/aws-lambda").CustomEmailSenderTriggerEvent}
 * @return {Promise<void>}
 */
exports.handler = async (event) => {
    console.info(`userPoolId: ${event.userPoolId}`)
    console.info(`triggerSource: ${event.triggerSource}`)
    console.info(`request: ${JSON.stringify(event.request)}`)

    // not handle any events other than the following
    // CustomEmailSender_AdminCreateUser
    // CustomEmailSender_ForgotPassword
    if (
        ![
            'CustomEmailSender_AdminCreateUser',
            'CustomEmailSender_ForgotPassword',
        ].includes(event.triggerSource)
    ) {
        console.warn(
            `cannot implementation triggerSource: ${event.triggerSource}`
        )
        return
    }

    switch (event.triggerSource) {
        case 'CustomEmailSender_AdminCreateUser': {
            await handleAdminCreateUser(event.request)
            break
        }
        case 'CustomEmailSender_ForgotPassword': {
            await handleForgotPassword(event.request)
            break
        }
    }

    return
}

const handleAdminCreateUser = async (request) => {
    // decrypt temporary password
    let temporaryPassword
    if (request.code) {
        const { plaintext } = await decrypt(
            keyring,
            base64.toByteArray(request.code)
        )
        temporaryPassword = plaintext
    }
    if (!temporaryPassword) {
        console.error('failed to decrypt temporary password')
        return
    }

    // send email by SendGrid
    const username = request.clientMetadata.username
    const email = request.userAttributes.email
    const body = `
    <p>Your username is ${username} and temporary password is ${temporaryPassword}</p>
    `
    await sendMail(
        'no-reply@example.com',
        email,
        'Your temporary password',
        body
    )
}

const handleForgotPassword = async (request) => {
    // decrypt confirmation code
    let confirmationCode
    if (request.code) {
        const { plaintext } = await decrypt(
            keyring,
            base64.toByteArray(request.code)
        )
        confirmationCode = plaintext
    }
    if (!confirmationCode) {
        console.error('failed to decrypt confirmation code')
        return
    }

    // send email by SendGrid
    const username = request.clientMetadata.username
    const email = request.userAttributes.email
    const body = `
    <p>Your username is ${username} and confirmation code is ${confirmationCode}</p>
    `
    await sendMail(
        'no-reply@example.com',
        email,
        'Notification of password reset',
        body
    )
}

const sendMail = async (from, to, subject, html) => {
    try {
        console.info(`send email is start. to=${to}`)
        await sendgrid.send({
            from,
            to,
            subject,
            html,
        })
        console.info(`send email is finished.`)
    } catch (error) {
        console.error(`failed to send email. ${JSON.stringify(error)}`)
    }
}
