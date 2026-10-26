const { parseSync } = require('@babel/core')

// A source-file pragma left in already compiled dependency code can change the
// JSX settings for the entire UMD bundle when Keystone compiles that bundle.
// Remove only parsed pragma comments; preserve strings and executable code.
module.exports = function stripCompiledJsxPragmas (source) {
    const ast = parseSync(source, { configFile: false, babelrc: false, sourceType: 'unambiguous' })
    const pragmas = (ast.comments || []).filter(({ value }) => /^\s*\*?\s*@jsx(?:ImportSource|Runtime)\s+\S+\s*$/.test(value))
    for (const comment of pragmas.reverse()) {
        source = source.slice(0, comment.start) + source.slice(comment.end)
    }
    return source
}
