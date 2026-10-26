// Default Node trust-store gate for the eMudhra emergency root distrust.
// This complements, but does not replace, application-specific TLS validation.
const assert = require('node:assert/strict')
const tls = require('node:tls')
const { X509Certificate } = require('node:crypto')
const affectedRoot = '86A1ECBA089C4A8D3BBE2734C612BA341D813E043CF9E8A862CD5C57A36BBE6B'
assert.equal(typeof tls.getCACertificates, 'function', 'Default trust inventory API is required')
const roots = tls.getCACertificates('default')
assert.ok(roots.length > 0, 'An empty trust store is not an acceptable mitigation')
assert.ok(!roots.some(pem => new X509Certificate(pem).fingerprint256.replaceAll(':', '') === affectedRoot),
    'Default Node trust store still contains emSign ECC Root CA - G3')
assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0', 'TLS verification must remain enabled')
console.log('Default Node trust excludes affected emSign G3 root; trusted roots remain configured')
