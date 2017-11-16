const childProcess = require('child_process')
const path = require('path')

const MinifyPlugin = require('babel-minify-webpack-plugin')
const chalk = require('chalk')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const ScriptExtHtmlWebpackPlugin = require('script-ext-html-webpack-plugin')
const webpack = require('webpack')
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
const ManifestPlugin = require('webpack-manifest-plugin')
const nodeExternals = require('webpack-node-externals')

module.exports = function getBaseConfig({
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
}) {
  const main = server ? 'server' : 'client'

  const entry = {}
  entry[main] = []

  // HMR
  if (debug && !server) {
    entry[main].push(`webpack-dev-server/client?${assetsUrl.href}`)
  }
  if ((!debug || forcePolyfill) && !server) {
    entry[main].push('regenerator-runtime/runtime.js')
  }
  // Main entry point
  entry[main].push(path.resolve(dirs.src, main))

  // Loading rules
  const rules = [
    {
      test: /\.jsx?$/,
      include: dirs.src,
      use: {
        loader: 'babel-loader',
        options: {
          babelrc: false,
          presets: [
            'react',
            [
              'env',
              {
                targets: server
                  ? { node: true }
                  : {
                      browsers:
                        debug && !forcePolyfill
                          ? ['last 1 Chrome version']
                          : ['> 3% in FR', 'last 2 versions', 'not ie <= 10'],
                    },
                modules: false,
                debug: verbose,
              },
            ],
          ],
          plugins: ['syntax-dynamic-import', 'transform-object-rest-spread'],
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
        loader: 'resolve-url-loader',
      },
      {
        loader: 'sass-loader',
        options: {
          sourceMap: true,
          includePaths: [dirs.src, dirs.styles],
        },
      },
    ]
    if (debug) {
      // Load it like style tags
      rules.push({
        test: /\.sass$/i,
        use: [styleLoader].concat(sassToCssLoaders),
      })
    } else {
      // Extract it in css files
      rules.push({
        test: /\.sass$/i,
        use: ExtractTextPlugin.extract({
          fallback: 'style-loader',
          use: sassToCssLoaders,
        }),
      })
    }
    // Css for deps
    rules.push({
      test: /\.css$/i,
      use: [styleLoader, cssLoader],
    })
  }
  // Plugins
  const plugins = [
    // Common all
    new ManifestPlugin(),
    // DON'T use JSON stringify and yes it needs multiple quotes
    // (JSON is imported by babel in a file that use module.exports => X[)
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': `"${process.env.NODE_ENV || 'development'}"`,
      'process.env.STAGING': `${staging}`,
    }),
  ]
  if (debug) {
    // Common debug
    plugins.push(
      new webpack.NamedModulesPlugin(),
      new webpack.NoEmitOnErrorsPlugin()
    )
  } else {
    plugins.push(new webpack.HashedModuleIdsPlugin())
  }
  if (!server) {
    // Common client
    plugins.push(
      new HtmlWebpackPlugin({
        alwaysWriteToDisk: true,
        cache: !debug,
        template: `${dirs.src}/index.ejs`,
      }),
      // Puts every deps in a vendor bundle
      // new webpack.optimize.CommonsChunkPlugin({
      //   name: 'vendor',
      //   chunks: ['client', 'Admin'],
      //   minChunks: ({ resource }) => /node_modules/.test(resource)
      // }),
      // Or put only shared deps
      new webpack.optimize.CommonsChunkPlugin({
        name: 'vendor',
        minChunks: module =>
          module.context && module.context.includes('node_modules'),
      }),
      // manifest contains build changes to keep vendor hash stable (caching)
      new webpack.optimize.CommonsChunkPlugin({
        name: 'manifest',
        minChunks: Infinity,
      }),
      // Inline manifest (~1kb) and defer scripts
      new ScriptExtHtmlWebpackPlugin({
        inline: /manifest.*\.js$/,
        defaultAttribute: 'defer',
        // Remove prefetch for now as it slows the load
        // (and there's too many async)
        // prefetch: {
        //   test: /\.js$/,
        //   chunks: 'async'
        // }
      }),
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
          compiler.plugin('done', stats => {
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
          compiler.plugin('done', stats => {
            const end = new Date().getTime() - this.compilationStart
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
      new ExtractTextPlugin({
        filename: '[name].[chunkhash].css',
        allChunks: true,
      }),
      new webpack.optimize.ModuleConcatenationPlugin(),
      new MinifyPlugin()
    )
  }

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
    : 'errors-only'

  const conf = {
    devtool: debug ? 'cheap-module-source-map' : 'source-map',
    entry,
    // Defines the output file for the html script tag
    output: {
      path: server ? dirs.dist : dirs.assets,
      filename: debug || server ? '[name].js' : '[name].[chunkhash].js',
      chunkFilename: debug ? '[name].js' : '[name].[chunkhash].js',
      publicPath,
      libraryTarget: server ? 'commonjs2' : void 0,
    },
    watch: debug && server ? true : void 0,
    target: server ? 'node' : 'web',

    performance: {
      hints: debug || server ? false : 'warning',
    },

    resolve: {
      extensions: ['.js', '.jsx'],
    },

    // Entry points list, allow to load a file with transforms
    module: { rules },
    stats,
    devServer: {
      host: assetsUrl.hostname,
      port: assetsUrl.port,
      proxy: [
        {
          context: ['/api'],
          target: apiUrl.href,
          logLevel: verbose ? 'info' : 'error',
        },
        {
          context: ['/polyfill.js', '/favicon.ico'],
          target: serverUrl.href,
          logLevel: verbose ? 'info' : 'error',
        },
        {
          context: ['/assets'],
          target: assetsUrl.href,
          pathRewrite: { '^/assets': '' },
          logLevel: verbose ? 'info' : 'error',
        },
      ],
      publicPath: '/',
      disableHostCheck: true,
      compress: true,
      noInfo: !verbose,
      quiet: !verbose,
      hot: true,
      overlay: true,
      historyApiFallback: true,
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

  if (server) {
    // Options for node target
    conf.node = {
      __dirname: true,
    }
    conf.externals = [
      nodeExternals({
        modulesDir: dirs.modules,
        whitelist: [/\.css$/],
      }),
    ]
  }
  return conf
}
