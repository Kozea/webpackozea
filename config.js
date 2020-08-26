/* eslint-env node */
/* eslint-disable no-console */

const childProcess = require('child_process')
const path = require('path')

const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const chalk = require('chalk')
const sass = require('dart-sass')
const ManifestPlugin = require('webpack-manifest-plugin')
const nodeExternals = require('webpack-node-externals')
const webpack = require('webpack')

function setupRules(dirs, server, debug, forcePolyfill, verbose) {
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
                targets: server
                  ? { node: true }
                  : {
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
    {
      test: /\.(jpe?g|png|gif|svg|ttf|woff|woff2|eot|pdf)$/i,
      use: {
        loader: 'url-loader',
        options: {
          limit: 2500,
        },
      },
    },
  ]

  if (server) {
    // Ignoring styles on server
    rules.push({ test: /\.(css|sass)$/, use: 'ignore-loader' })
  } else {
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
  }
  return rules
}

function setupPlugins(
  staging, server, verbose, debug, renderHtml, serverUrl, dirs, inspect,
  cwd, assetsUrl
) {
  const plugins = [
    // Common all
    new ManifestPlugin({
      writeToFileEmit: true,
    }),
    // DON'T use JSON stringify and yes it needs multiple quotes
    // (JSON is imported by babel in a file that use module.exports => X[)
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': `"${process.env.NODE_ENV || 'development'}"`,
      'process.env.STAGING': `${staging}`,
    }),
  ]
  if (!server) {
    // Common client
    plugins.push(
      new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        openAnalyzer: false,
        logLevel: verbose ? 'info' : 'error',
      })
    )
  }

  if (debug && !server) {
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
    if (server) {
      // Server debug
      // Start and restart server
      console.log(
        `  ${chalk.magenta('⯂')} Node koaze server: ${chalk.blue(
          serverUrl.href
        )}`
      )
      class ServerDevPlugin {
        apply(compiler) {
          compiler.hooks.done.tap('WebpackozeaServerDevPlugin', stats => {
            if (this.server) {
              // eslint-disable-next-line
              console.log(
                `  ${chalk.cyan('↻')} Restarting node server. ${time(stats)}`
              )
              this.server.kill()
            } else {
              // eslint-disable-next-line
              console.log(
                `  ${chalk.green('⏻')} Starting node server.   ${time(stats)}`
              )
            }

            this.server = childProcess.fork(
              path.resolve(dirs.dist, 'server.js'),
              {
                cwd,
                silent: false,
                execArgv: inspect ? ['--inspect'] : [],
              }
            )
          })
        }
      }
      plugins.push(new ServerDevPlugin())
    } else {
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
  }

  if (!debug && !server) {
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

module.exports = function getBaseConfig(
  {
    apiUrl,
    assetsUrl,
    cwd,
    debug,
    dirs,
    forcePolyfill,
    inspect,
    publicPath,
    server,
    serverUrl,
    staging,
    verbose,
  },
  renderHtml
) {
  const main = server ? 'server' : 'client'

  const entry = {}
  entry[main] = []

  // HMR
  if (debug && !server) {
    entry[main].push(`webpack-dev-server/client?${assetsUrl.href}`)
  }
  // Main entry point
  entry[main].push(path.resolve(dirs.src, main))

  // Loading rules
  const rules = setupRules(dirs, server, debug, forcePolyfill, verbose)
  // Plugins
  const plugins = setupPlugins(
    staging, server, verbose, debug, renderHtml, serverUrl, dirs, inspect,
    cwd, assetsUrl
  )

  const stats = verbose
    ? {
        entrypoints: true,
        chunks: true,
        chunkModules: false,
        chunkOrigins: true,
        colors: true,
        depth: true,
        usedExports: true,
        providedExports: true,
        optimizationBailout: true,
        errorDetails: true,
        publicPath: true,
        performance: true,
        reasons: true,
        exclude: () => false,
        maxModules: Infinity,
        warnings: true,
      }
    : {
        assets: false,
        builtAt: false,
        cached: false,
        cachedAssets: false,
        children: false,
        chunks: false,
        chunkGroups: false,
        chunkModules: false,
        chunkOrigins: false,
        colors: true,
        depth: false,
        entrypoints: false,
        env: false,
        errors: true,
        errorDetails: true,
        hash: false,
        modules: false,
        moduleTrace: false,
        performance: false,
        providedExports: false,
        publicPath: false,
        reasons: false,
        source: false,
        timings: false,
        usedExports: false,
        version: false,
        warnings: false,
      }
  const filename = debug || server ? '[name].js' : '[name].[chunkhash].js'

  const conf = {
    mode: debug ? 'development' : 'production',
    entry,
    // Defines the output file for the html script tag
    output: {
      path: server ? dirs.dist : dirs.assets,
      filename,
      // We might need to remove [name] here for long time cache
      chunkFilename: filename,
      publicPath,
      libraryTarget: server ? 'commonjs2' : void 0,
    },
    watch: debug && server ? true : void 0,
    target: server ? 'node' : 'web',
    optimization: server
      ? void 0
      : {
          runtimeChunk: true,
          splitChunks: {
            chunks: 'all',
          },
        },
    performance: {
      hints: debug || server ? false : 'warning',
    },

    resolve: {
      extensions: ['.mjs', '.js', '.jsx'],
    },

    // Entry points list, allow to load a file with transforms
    module: { rules },
    stats,
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

  if (debug) {
    conf.devtool = 'inline-source-map'
  }

  if (server) {
    // Options for node target
    conf.node = {
      __dirname: true,
    }
    conf.externals = [
      nodeExternals({
        modulesDir: dirs.modules,
        allowlist: [/\.css$/],
      }),
    ]
  }
  return conf
}
