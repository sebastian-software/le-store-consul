'use strict'

module.exports.create = function(options) {
  const defaults = {
    host: "localhost",
    port: 8500,
    secure: false,
    ca: null,
    basekey: "greenlock",
    simulate: process.env.GREENLOCK_SIMULATE === "true"
  }
  const finalOptions = Object.assign({}, defaults, options)
  const consulOptions = {
    host: finalOptions.host,
    port: finalOptions.port,
    secure: finalOptions.secure,
    ca: finalOptions.ca,
    defaults: null,
    promisify: true,
  }
  var consul = require("consul")(consulOptions)

  var crypto = require('crypto')
  var memDb = {
    accountKeypairs: {},
    certificateKeypairs: {},
    accountIndices: {},
    certIndices: {},
    certificates: {},
    accounts: {},
    accountCerts: {}
  }

  const simulationStore = {}

  function consulSave(key, value)
  {
    const consulKey = `${finalOptions.basekey}/${key}`

    if (finalOptions.simulate)
    {
      simulationStore[consulKey] = value
      return Promise.resolve()
    }

    return consul.kv.set(consulKey, JSON.stringify(value))
  }

  function consulLoad(key)
  {
    const consulKey = `${finalOptions.basekey}/${key}`

    if (finalOptions.simulate)
      return Promise.resolve(simulationStore[consulKey] || null)

    return consul.kv.get(consulKey)
      .then((result) =>
      {
        try
        {
          return JSON.parse(result.Value)
        }
        catch (error)
        {
          return null
        }
      })
      .catch(error =>
      {
        console.error(error.stack)
        return null
      })
  }

  var accounts = {
      // Accounts
      setKeypair: function(opts, keypair, cb)
      {
        // opts.email // non-optional
        // opts.keypair // non-optional

        if (!opts.email) {
            cb(new Error("MUST use email when setting Keypair"))
            return
        }

        if (!keypair.privateKeyJwk) {
            cb(new Error("MUST use privateKeyJwk when setting Keypair"))
            return
        }
        if (!keypair.privateKeyPem) {
            cb(new Error("MUST use privateKeyPem when setting Keypair"))
            return
        }
        if (!keypair.publicKeyPem) {
            cb(new Error("MUST use publicKeyPem when setting Keypair"))
            return
        }

        var accountId = crypto.createHash('sha256').update(keypair.publicKeyPem).digest('hex')

        return Promise.all([
          consulSave(`accountIndices/${accountId}`, accountId),
          consulSave(`accountIndices/${opts.email}`, accountId),
          consulSave(`accountKeypairs/${accountId}`, keypair)
        ]).then(() =>
        {
          consulLoad(`accounts/${accountId}`)
            .then((result) =>
            {
              cb(null, result)
            })
        })
        .catch(error => cb(error))
      },
      
      // Accounts
      checkKeypair: function(opts, cb)
      {
        // opts.email // optional
        // opts.accountId // optional

        var keypair = opts.keypair || {}

        let indexPromise
        if (keypair.publicKeyPem) {
          const index = crypto.createHash('sha256').update(keypair.publicKeyPem).digest('hex')
          indexPromise = consulLoad(`accountIndices/${index}`)
        } else if (keypair.publicKeyJwk) {
          // TODO RSA.exportPublicPem(keypair)
          cb(new Error("id from publicKeyJwk not yet implemented"))
          return
        } else if (opts.email) {
          indexPromise = consulLoad(`accountIndices/${opts.email}`)
        } else {
          cb(new Error("MUST supply email or keypair.publicKeyPem or keypair.publicKeyJwk"))
          return
        }

        return indexPromise
          .then((index) => consulLoad(`accountKeypairs/${index}`))
          .then((result) => cb(null, result))
          .catch(error => cb(error))
      },

      // Accounts
      set: function(opts, reg, cb) {
        // opts.email
        // reg.keypair
        // reg.receipt // response from acme server

        var keypair = reg.keypair || opts.keypair || {}
        var accountId
        let indexPromise

        if (keypair.publicKeyPem) {
            const index = crypto.createHash('sha256').update(keypair.publicKeyPem).digest('hex')
            indexPromise = consulLoad(`accountIndices/${index}`)
        } else if (keypair.publicKeyJwk) {
            // TODO RSA.exportPublicPem(keypair)
            cb(new Error("id from publicKeyJwk not yet implemented"))
            return
        } else if (opts.email) {
            indexPromise = consulLoad(`accountIndices/${opts.email}`)
        } else {
            cb(new Error("MUST supply email or keypair.publicKeyPem or keypair.publicKeyJwk"))
            return
        }

        indexPromise
          .then(index => consulLoad(`accountIndices/${index}`))
          .then(accountId =>
          {
            if (!accountId) {
              cb(new Error("keypair was not previously set with email and keypair.publicKeyPem"))
              return
            }

            const account = {
              id: accountId,
              // TODO nix accountId
              accountId: accountId,
              email: opts.email,
              keypair: keypair,
              agreeTos: opts.agreeTos || reg.agreeTos
              //, receipt: reg.receipt || opts.receipt
            }
            Object.keys(reg).forEach(function(key) {
                account[key] = reg[key]
            })

            return consulSave(`accounts/${accountId}`, account)
              .then(() => cb(null, account))
          })
          .catch(error => cb(error))
      },

      // Accounts
      check: function(opts, cb) {
        // opts.email // optional
        // opts.accountId // optional
        // opts.domains // optional

        var keypair = opts.keypair || {}
        var accountId
        var account
        let indexPromise

        if (opts.accountId) {
            indexPromise = consulLoad(`accountIndices/${opts.accountId}`)
        } else if (keypair.publicKeyPem) {
            const index = crypto.createHash('sha256').update(keypair.publicKeyPem).digest('hex')
            indexPromise = consulLoad(`accountIndices/${index}`)
        } else if (keypair.publicKeyJwk) {
            // TODO RSA.exportPublicPem(keypair)
            cb(new Error("id from publicKeyJwk not yet implemented"))
            return
        } else if (opts.email) {
            indexPromise = consulLoad(`accountIndices/${opts.email}`)
        } else if (opts.domains && opts.domains[0]) {
            indexPromise = consulLoad(`accountIndices/${opts.domains[0]}`)
        } else {
            console.error(opts)
            cb(new Error("MUST supply email or keypair.publicKeyPem or keypair.publicKeyJwk"))
            return
        }

        indexPromise
          .then(index => consulLoad(`accountIndices/${index}`))
          .then(accountId =>
          {
            if (!accountId) {
                cb(null, null)
                return
            }

            return Promise.all([
              consulLoad(`accounts/${accountId}`),
              consulLoad(`accountKeypairs/${accountId}`)
            ])
              .then(result => {
                const account = result[0]
                if (!account) {
                  console.log("No account for", accountId)
                  return cb(null, null)
                }

                account.keypair = result[1]

                return cb(null, account)
              })
          })
          .catch(error => cb(error))
      }
  }



  var certificates = {
    // Certificates
    setKeypair: function(opts, keypair, cb) {
      // opts.domains

      if (!opts.domains || !opts.domains.length) {
        cb(new Error("MUST use domains when setting Keypair"))
        return
      }
      if (!opts.email) {
        cb(new Error("MUST use email when setting Keypair"))
        return
      }
      if (!opts.accountId) {
        cb(new Error("MUST use accountId when setting Keypair"))
        return
      }

      if (!keypair.privateKeyJwk) {
        cb(new Error("MUST use privateKeyJwk when setting Keypair"))
        return
      }
      if (!keypair.privateKeyPem) {
        cb(new Error("MUST use privateKeyPem when setting Keypair"))
        return
      }
      if (!keypair.publicKeyPem) {
        cb(new Error("MUST use publicKeyPem when setting Keypair"))
        return
      }

      var subject = opts.domains[0]

      const todos = opts.domains.map(function(domain) {
        return consulSave(`certIndices/${domain}`, subject)
      })

      todos.push(consulSave(`certKeypairs/${subject}`, keypair))
      /*
      {
        subject: subject
      , keypair: keypair
      }
      */

      return Promise.all(todos)
        .then(() => cb(null, keypair))
        .catch(error => cb(error))
    },
    
    // Certificates
    checkKeypair: function(opts, cb) {
      // opts.domains
      if (!opts.domains || !opts.domains.length) {
          cb(new Error("MUST use domains when checking Keypair"))
          return
      }

      var domain = opts.domains[0]

      return consulLoad(`certIndices/${domain}`)
        .then(subject => consulLoad(`certKeypairs/${subject}`))
        .then(result => cb(null, result))
        .catch(error => cb(error))
    },

    // Certificates
    set: function(opts, certs, cb) {
      // opts.domains
      // opts.email // optional
      // opts.accountId // optional

      // certs.privkey
      // certs.cert
      // certs.chain

      var index
      var accountId
      var account
      var subject = certs.subject || opts.domains[0]
      var altnames = certs.altnames || opts.domains
      var accountCerts

      if (opts.accountId) {
          index = opts.accountId
      } else if (opts.email) {
          index = opts.email
      } else {
          cb(new Error("MUST supply email or accountId"))
          return
      }

      return consulLoad(`accountIndices/${index}`)
        .then(accountId => consulLoad(`accounts/${accountId}`))
        .then(account => {
          if (!account) {
              cb(new Error("account must exist"))
              return
          }

          return consulLoad(`accountIndices/${index}`)
        })
        .then((accountId) => {
          if (!accountId) {
              cb(new Error("keypair was not previously set with email and keypair.publicKeyPem"))
              return
          }

          const todos = altnames.map((altname) => consulSave(`certIndices/${altname}`, subject))
          todos.push(consulSave(`certIndices/${subject}`, subject))

          return Promise.all(todos)
            .then(() => consulLoad(`accountCerts/${accountId}`))
            .then(accountCerts => accountCerts || {})
            .then(accountCerts =>
            {
              accountCerts[subject] = subject

              // SAVE to the database, index the email address, the accountId, and alias the domains
              return Promise.all([
                consulSave(`accountCerts/${accountId}`, accountCerts),
                consulSave(`certificates/${subject}`, certs)
              ])
            })
            .then(() => cb(null, certs))
        })
        .catch(error => cb(error))
    }
        // Certificates
        ,
    check: function(opts, cb) {
      // You will be provided one of these (which should be tried in this order)
      // opts.domains
      // opts.email // optional
      // opts.accountId // optional
      var subject
      var subjects
      var accountIdPromise

      if (opts.domains) {
        return consulLoad(`certIndices/${opts.domains[0]}`)
          .then(subject => consulLoad(`certificates/${subject}`))
          .then(result => cb(null, result))
      }

      if (opts.accountId) {
          accountIdPromise = consulLoad(`accountIndices/${opts.accountId}`)
      } else if (opts.email) {
        accountIdPromise = consulLoad(`accountIndices/${opts.email}`)
      }

      return consulLoad(`accountCerts/${accountId}`)
        .then(subjects =>
        {
          return Promise.all(subjects.map(subjectIndex => {
            return consulLoad(`certIndices/${subjectIndex}`)
              .then(subject => consulLoad(`certificates/${subject}`))
          }))
        })
        .then(result => cb(null, result))
    }

  }

  return {
      getOptions: function() {
          // merge options with default settings and then return them
          return finalOptions
      },
      accounts: accounts,
      certificates: certificates
  }
}
