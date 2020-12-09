/* eslint-env node */
/* eslint-disable no-console */

const path = require('path')

const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const chalk = require('chalk')
const sass = require('dart-sass')
const webpack = require('webpack')

function setupRules(dirs, debug, forcePolyfill, verbose) {
  const rules = [
    {
      test: /\.jsx?$/,
      include: dirs.src,
      use: {
        loader: 'babel-loader',
        options: {
          cacheDirectory: true,
          babelrc: false,
          sourceType: 'unambiguous',
          presets: [
            '@babel/preset-react',
            [
              '@babel/preset-env',
              {
                targets: {
                  browsers:
                    debug && !forcePolyfill
                      ? ['last 1 Chrome version']
                      : ['> .5% in FR'],
                },
                modules: false,
                debug: verbose,
              },
            ],
          ],
          plugins: [
            '@babel/plugin-proposal-export-default-from',
            '@babel/plugin-syntax-dynamic-import',
            '@babel/plugin-proposal-object-rest-spread',
            ['@babel/plugin-proposal-decorators', { legacy: true }],
            'add-react-static-displayname',
            ['@babel/plugin-proposal-class-properties', { loose: true }],
            '@babel/plugin-transform-runtime',
          ].filter(_ => _),
        },
      },
    },
  ]

  // Sass -> Css
  const styleLoader = { loader: 'style-loader' }
  const cssLoader = {
    loader: 'css-loader',
    options: { sourceMap: debug },
  }
  const sassToCssLoaders = [
    cssLoader,
    {
      loader: 'sass-loader',
      options: {
        implementation: sass,
        sassOptions: {
          includePaths: [dirs.src, dirs.styles, dirs.modules],
        },
      },
    },
  ]
  rules.push({
    test: /\.sass$/i,
    exclude: /\.lazy\.sass$/i,
    use: [debug ? styleLoader : MiniCssExtractPlugin.loader].concat(
      sassToCssLoaders
    ),
  })
  rules.push({
    test: /\.lazy\.sass$/i,
    use: debug
      ? [
          {
            ...styleLoader,
            options: {
              injectType: 'lazyStyleTag',
            },
          },
        ].concat(sassToCssLoaders)
      : 'ignore-loader', // For now it seems better to ignore them
  })
  // Css for deps
  rules.push({
    test: /\.css$/i,
    use: [styleLoader, cssLoader],
  })
  return rules
}

function setupPlugins(verbose, debug, renderHtml, assetsUrl) {
  const plugins = [
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      openAnalyzer: false,
      logLevel: verbose ? 'info' : 'error',
    }),
  ]

  if (debug) {
    // Client _debug
    plugins.push(new webpack.HotModuleReplacementPlugin())
    class HtmlPlugin {
      apply(compiler) {
        compiler.hooks.emit.tap('WebpackozeaHtmlPlugin', compilation => {
          const html = renderHtml()
          compilation.assets['index.html'] = {
            size: () => html.length,
            source: () => html,
          }
        })
      }
    }
    renderHtml && plugins.push(new HtmlPlugin())
  }

  if (debug) {
    const time = stats => {
      let t = stats.endTime - stats.startTime
      let unit = 'ms'
      if (t > 60000) {
        t /= 60000
        unit = 'm'
      } else if (t > 1000) {
        t /= 1000
        unit = 's'
      }
      return `${chalk.yellow('⚙')} ${chalk.white(t)}${chalk.gray(unit)}`
    }
    console.log(
      `  ${chalk.magenta('⯃')} Development web server: ${chalk.blue(
        assetsUrl.href
      )}`
    )
    class ClientDevPlugin {
      apply(compiler) {
        // Watch fixer
        const timefix = 11000
        let watching = {}
        const aspectWatch = compiler.watch
        compiler.watch = (...args) => {
          watching = aspectWatch.apply(compiler, args)
          return watching
        }
        compiler.hooks.watchRun.tapAsync('WebpackozeaWatchFix', (_, cb) => {
          watching.startTime += timefix
          cb && cb()
        })
        compiler.hooks.done.tapAsync('WebpackozeaWatchFix', (stats, cb) => {
          stats.startTime -= timefix
          cb && cb()
        })

        compiler.hooks.done.tap('WebpackozeaClientDevPlugin', stats => {
          stats.endTime - stats.startTime > 0 &&
            console.log(
              `  ${chalk.magenta('⚛')} Browser client ready.   ${time(stats)}`
            )
        })
      }
    }
    plugins.push(new ClientDevPlugin())
  }

  if (!debug) {
    // Client prod
    plugins.push(
      new MiniCssExtractPlugin({
        // Options similar to the same options in webpackOptions.output
        // both options are optional
        filename: '[name].[chunkhash].css',
        chunkFilename: '[name].[chunkhash].css',
      })
    )
  }

  return plugins
}

module.exports = function getClientConfig(
  {
    apiUrl,
    assetsUrl,
    debug,
    dirs,
    forcePolyfill,
    publicPath,
    serverUrl,
    verbose,
  },
  renderHtml,
  stats
) {
  const main = 'client'

  const entry = {}
  entry[main] = []

  // HMR
  if (debug) {
    entry[main].push(`webpack-dev-server/client?${assetsUrl.href}`)
  }
  // Main entry point
  entry[main].push(path.resolve(dirs.src, main))

  // Loading rules
  const rules = setupRules(dirs, debug, forcePolyfill, verbose)
  // Plugins
  const plugins = setupPlugins(verbose, debug, renderHtml, assetsUrl)

  const filename = debug ? '[name].js' : '[name].[chunkhash].js'

  const conf = {
    entry,
    // Defines the output file for the html script tag
    output: {
      path: dirs.assets,
      filename,
      // We might need to remove [name] here for long time cache
      chunkFilename: filename,
      publicPath,
      libraryTarget: void 0,
    },
    watch: void 0,
    target: 'web',
    optimization: {
      runtimeChunk: true,
      splitChunks: {
        chunks: 'all',
      },
    },
    performance: {
      hints: debug ? false : 'warning',
    },
    // Entry points list, allow to load a file with transforms
    module: { rules },
    devServer: {
      host: assetsUrl.hostname,
      port: assetsUrl.port,
      proxy: {
        '/api': {
          target: apiUrl.href,
          logLevel: verbose ? 'debug' : 'warn',
        },
        '/static': {
          target: serverUrl.href,
          logLevel: verbose ? 'debug' : 'warn',
        },
        '/favicon.ico': {
          target: serverUrl.href,
          logLevel: verbose ? 'debug' : 'warn',
        },
      },
      disableHostCheck: true,
      compress: true,
      noInfo: !verbose,
      hot: true,
      overlay: true,
      historyApiFallback: {
        index: '/assets/index.html',
      },
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      watchOptions: {
        ignored: /node_modules/,
      },
      stats,
    },
    // Webpack plugins
    plugins,
  }

  return conf
}
