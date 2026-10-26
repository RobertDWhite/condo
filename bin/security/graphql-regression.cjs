// Verify the upstream prototype-pollution fixes in every installed GraphQL utils copy.
// GHSA-7mx3-vvmw-hjmv and GHSA-c4qx-w738-7hr3; no network or application data used.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const marker = '__condo_security_probe__'
const packages = new Set()
function visitModules(dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        const roots = entry.name.startsWith('@')
            ? fs.readdirSync(path.join(dir, entry.name), { withFileTypes: true }).filter(x => x.isDirectory()).map(x => path.join(dir, entry.name, x.name))
            : [path.join(dir, entry.name)]
        for (const root of roots) {
            if (root.endsWith('/@graphql-tools/utils')) packages.add(root)
            visitModules(path.join(root, 'node_modules'))
        }
    }
}
async function main() {
    visitModules(path.resolve('node_modules'))
    for (const parent of ['apps', 'packages']) for (const name of fs.readdirSync(parent)) visitModules(path.resolve(parent, name, 'node_modules'))
    assert.ok(packages.size > 0, 'No GraphQL utils copies discovered')
    for (const root of packages) {
        for (const format of ['cjs', 'esm']) {
            const file = path.join(root, format, 'mergeDeep.js')
            assert.ok(fs.existsSync(file), `${root}: missing ${format} build`)
            const { mergeDeep } = await import(pathToFileURL(file).href)
            for (const key of ['__proto__', 'constructor', 'prototype']) {
                try {
                    const source = JSON.parse(`{"${key}": {"prototype": {"${marker}": true}}, "safe": {"value": 2}}`)
                    const result = mergeDeep([{ safe: { original: 1 } }, source])
                    assert.equal(Object.prototype[marker], undefined, `${format}: polluted global prototype`)
                    assert.equal(Object.hasOwn(result, key), false, `${format}: retained unsafe key ${key}`)
                    assert.deepEqual(result.safe, { original: 1, value: 2 })
                } finally {
                    delete Object.prototype[marker]
                    delete Function.prototype[marker]
                }
            }
            assert.deepEqual(mergeDeep([{ x: 1 }, { y: 2 }]), { x: 1, y: 2 })
            const incrementalFile = path.join(root, format, 'mergeIncrementalResult.js')
            if (fs.existsSync(incrementalFile)) {
                const { mergeIncrementalResult } = await import(pathToFileURL(incrementalFile).href)
                for (const segment of [['__proto__'], { toString: () => '__proto__' }, null, '__proto__', 'constructor', 'prototype']) {
                    for (const body of [{ data: { [marker]: true } }, { items: [{ [marker]: true }, { safe: 2 }] }]) {
                        const result = {}
                        try {
                            mergeIncrementalResult({ executionResult: result, incrementalResult: { path: ['safe', segment, marker], ...body } })
                            assert.equal(Object.prototype[marker], undefined, 'incremental prototype pollution')
                            assert.deepEqual(result, {}, 'unsafe path must not create partial containers')
                        } finally { delete Object.prototype[marker] }
                    }
                }
                const result = {}
                mergeIncrementalResult({ executionResult: result, incrementalResult: { path: ['items', 0], items: [{ name: 'a' }, { name: 'b' }] } })
                assert.deepEqual(result, { data: { items: [{ name: 'a' }, { name: 'b' }] } })
                const inherited = { item: { original: 1 } }
                const own = { data: Object.create(inherited) }
                mergeIncrementalResult({ executionResult: own, incrementalResult: { path: ['item'], data: { added: 2 } } })
                assert.deepEqual(inherited, { item: { original: 1 } }, 'inherited target changed')
                assert.deepEqual(own.data.item, { added: 2 })
            }
        }
        console.log('PASS', path.relative(process.cwd(), root))
    }
    console.log(`Verified ${packages.size} installed copies in both module formats`)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
