const assert = require('node:assert/strict')
const babel = require('@babel/core')
const strip = require('../../packages/ui/bin/strip-compiled-jsx-pragmas')
const source = '/** @jsxImportSource @tiptap/core */\nconst text = "/** @jsxImportSource preserved-string */";\nconst value = 1;'
const options = {
    filename: 'compiled-dependency.js', configFile: false, babelrc: false,
    presets: [require.resolve('babel-preset-react-app/prod')],
}
assert.throws(() => babel.transformSync(source, options), /importSource cannot be set/)
const result = strip(source)
assert.ok(result.includes('preserved-string'))
assert.ok(result.includes('const value = 1;'))
babel.transformSync(result, options)
console.log('Compiled JSX pragma regression passed')
