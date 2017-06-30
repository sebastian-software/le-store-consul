'use strict'


module.exports.create = function(options) {
  const Promise = require("bluebird");

  function emptyFnt() {}

  const defaults = {
    host: "localhost",
    port: 8500,
    secure: false,
    ca: null,
    basekey: "greenlock",
    simulate: process.env.GREENLOCK_SIMULATE === "true",
    debug: false
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
      setKeypairAsync: function(opts, keypair)
      {
        if (finalOptions.debug)
          console.log("ac setKeypairAsync")
        // opts.email // non-optional
        // opts.keypair // non-optional

        if (!opts.email) {
            return Promise.reject(new Error("MUST use email when setting Keypair"))
        }

        if (!keypair.privateKeyJwk) {
            return Promise.reject(new Error("MUST use privateKeyJwk when setting Keypair"))
        }
        if (!keypair.privateKeyPem) {
            return Promise.reject(new Error("MUST use privateKeyPem when setting Keypair"))
        }
        if (!keypair.publicKeyPem) {
            return Promise.reject(new Error("MUST use publicKeyPem when setting Keypair"))
        }

        var accountId = crypto.createHash('sha256').update(keypair.publicKeyPem).digest('hex')

        return Promise.all([
          consulSave(`accountIndices/${accountId}`, accountId),
          consulSave(`accountIndices/${opts.email}`, accountId),
          consulSave(`accountKeypairs/${accountId}`, keypair)
        ])
        .then(() => keypair)
      },
      
      // Accounts
      checkKeypairAsync: function(opts)
      {
        if (finalOptions.debug)
          console.log("ac checkKeypairAsync")
        // opts.email // optional
        // opts.accountId // optional

        var keypair = opts.keypair || {}

        let indexPromise
        if (keypair.publicKeyPem) {
          const index = crypto.createHash('sha256').update(keypair.publicKeyPem).digest('hex')
          indexPromise = consulLoad(`accountIndices/${index}`)
        } else if (keypair.publicKeyJwk) {
          // TODO RSA.exportPublicPem(keypair)
          return Promise.reject(new Error("id from publicKeyJwk not yet implemented"))
        } else if (opts.email) {
          indexPromise = consulLoad(`accountIndices/${opts.email}`)
        } else {
          return Promise.reject(new Error("MUST supply email or keypair.publicKeyPem or keypair.publicKeyJwk"))
        }

        return indexPromise
          .then((index) => consulLoad(`accountKeypairs/${index}`))
      },

      // Accounts
      setAsync: function(opts, reg) {
        if (finalOptions.debug)
          console.log("ac setAsync")
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
            return Promise.reject(new Error("id from publicKeyJwk not yet implemented"))
        } else if (opts.email) {
            indexPromise = consulLoad(`accountIndices/${opts.email}`)
        } else {
            return Promise.reject(new Error("MUST supply email or keypair.publicKeyPem or keypair.publicKeyJwk"))
        }

        return indexPromise
          .then(index => consulLoad(`accountIndices/${index}`))
          .then(accountId =>
          {
            if (!accountId) {
              return Promise.reject(new Error("keypair was not previously set with email and keypair.publicKeyPem"))
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
              .then(() => account)
          })
      },

      // Accounts
      checkAsync: function(opts) {
        if (finalOptions.debug)
          console.log("ac checkAsync")
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
            return Promise.reject(new Error("id from publicKeyJwk not yet implemented"))
        } else if (opts.email) {
            indexPromise = consulLoad(`accountIndices/${opts.email}`)
        } else if (opts.domains && opts.domains[0]) {
            indexPromise = consulLoad(`accountIndices/${opts.domains[0]}`)
        } else {
            console.error(opts)
            return Promise.reject(new Error("MUST supply email or keypair.publicKeyPem or keypair.publicKeyJwk"))
        }

        return indexPromise
          .then(index => consulLoad(`accountIndices/${index}`))
          .then(accountId =>
          {
            if (!accountId) {
              return null
            }

            return Promise.all([
              consulLoad(`accounts/${accountId}`),
              consulLoad(`accountKeypairs/${accountId}`)
            ])
              .then(result => {
                const account = result[0]
                if (!account) {
                  if (finalOptions.debug)
                    console.log("No account for", accountId)
                  return null
                }

                account.keypair = result[1]

                return account
              })
          })
      }
  }



  var certificates = {
    // Certificates
    setKeypairAsync: function(opts, keypair) {
      if (finalOptions.debug)
        console.log("ce setKeypairAsync")
      // opts.domains
      if (!opts.domains || !opts.domains.length) {
        return Promise.reject(new Error("MUST use domains when setting Keypair"))
      }
      if (!opts.email) {
        return Promise.reject(new Error("MUST use email when setting Keypair"))
      }
      if (!opts.account.accountId) {
        return Promise.reject(new Error("MUST use accountId when setting Keypair"))
      }

      if (!keypair.privateKeyJwk) {
        return Promise.reject(new Error("MUST use privateKeyJwk when setting Keypair"))
      }
      if (!keypair.privateKeyPem) {
        return Promise.reject(new Error("MUST use privateKeyPem when setting Keypair"))
      }
      if (!keypair.publicKeyPem) {
        return Promise.reject(new Error("MUST use publicKeyPem when setting Keypair"))
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
        .then(() => keypair)
    },
    
    // Certificates
    checkKeypairAsync: function(opts) {
      if (finalOptions.debug)
        console.log("ce checkKeypairAsync")
      // opts.domains
      if (!opts.domains || !opts.domains.length) {
        return Promise.reject(new Error("MUST use domains when checking Keypair"))
      }

      var domain = opts.domains[0]

      return consulLoad(`certIndices/${domain}`)
        .then(subject => consulLoad(`certKeypairs/${subject}`))
    },

    // Certificates
    setAsync: function(opts, certs) {
      if (finalOptions.debug)
        console.log("ce setAsync")

      const pems = certs || opts.pems
      // opts.domains
      // opts.email // optional
      // opts.accountId // optional

      // pems.privkey
      // pems.cert
      // pems.chain

      var index
      var accountId
      var account
      var subject = (pems && pems.subject) || opts.domains[0]
      var altnames = (pems && pems.altnames) || opts.domains
      var accountCerts

      if (opts.accountId) {
          index = opts.accountId
      } else if (opts.email) {
          index = opts.email
      } else {
          return Promise.reject(new Error("MUST supply email or accountId"))
      }

      return consulLoad(`accountIndices/${index}`)
        .then(accountId => consulLoad(`accounts/${accountId}`))
        .then(account => {
          if (!account) {
              return Promise.reject(new Error("account must exist"))
          }

          return consulLoad(`accountIndices/${index}`)
        })
        .then((accountId) => {
          if (!accountId) {
              return Promise.reject(new Error("keypair was not previously set with email and keypair.publicKeyPem"))
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
                consulSave(`certificates/${subject}`, pems)
              ])
            })
            .then(() => pems)
        })
    }
        // Certificates
        ,
    checkAsync: function(opts) {
      if (finalOptions.debug)
        console.log("ce checkAsync")
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
