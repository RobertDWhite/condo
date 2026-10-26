// GHSA-pqg4-j6r4-53mv: verify quote rejects comment-following line terminators.
// No subprocess or shell execution; only parser/quoting behavior is exercised.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const packages = new Set()
function visitModules(dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        const roots = entry.name.startsWith('@')
            ? fs.readdirSync(path.join(dir, entry.name), { withFileTypes: true }).filter(x => x.isDirectory()).map(x => path.join(dir, entry.name, x.name))
            : [path.join(dir, entry.name)]
        for (const root of roots) {
            if (path.basename(root) === 'shell-quote') packages.add(root)
            visitModules(path.join(root, 'node_modules'))
        }
    }
}
visitModules(path.resolve('node_modules'))
for (const parent of ['apps', 'packages']) for (const name of fs.readdirSync(parent)) visitModules(path.resolve(parent, name, 'node_modules'))
assert.ok(packages.size > 0, 'No shell-quote copies discovered')
for (const root of packages) {
    const { quote, parse } = require(root)
    for (const newline of ['\n', '\r', '\u2028', '\u2029']) {
        assert.throws(() => quote(['echo', { comment: 'test' }, `a${newline}probe`]), TypeError)
    }
    const args = ['printf', '%s', 'ordinary text', 'semi;colon', "single'quote"]
    assert.deepEqual(parse(quote(args)), args)
}
console.log(`Verified ${packages.size} installed shell-quote copies`)
