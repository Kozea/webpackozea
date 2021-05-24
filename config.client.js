/* eslint-env node */
/* eslint-disable no-console */

const path = require('path')

const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const HtmlWebpackHarddiskPlugin = require('html-webpack-harddisk-plugin')
const chalk = require('chalk')

function setupRules(
  dirs,
  debug,
  forcePolyfill,
  verbose,
  additionalIncludes = []
) {
  return [
    // JS LOADER
    {
      test: /\.jsx?$/,
      include: additionalIncludes.length
        ? [
            ...additionalIncludes.map(module =>
              path.join(dirs.modules, module)
            ),
            dirs.src,
          ]
        : dirs.src,
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
            ['@babel/plugin-proposal-private-methods', { loose: true }],
            '@babel/plugin-transform-runtime',
          ],
        },
      },
    },
    // STYLES LOADER
    {
      test: /.(css|sass|scss)$/i,
      exclude: /\.lazy\.sass$/i,
      use: [
        debug ? 'style-loader' : MiniCssExtractPlugin.loader,
        {
          loader: 'css-loader',
          options: { sourceMap: debug },
        },
        {
          loader: 'sass-loader',
          options: {
            sassOptions: {
              includePaths: [dirs.src, dirs.styles, dirs.modules],
            },
          },
        },
      ],
    },
    {
      test: /\.lazy\.sass$/i,
      use: debug
        ? [
            {
              loader: 'style-loader',
              options: {
                injectType: 'lazyStyleTag',
              },
            },
            {
              loader: 'css-loader',
              options: { sourceMap: debug },
            },
            {
              loader: 'sass-loader',
              options: {
                sassOptions: {
                  includePaths: [dirs.src, dirs.styles, dirs.modules],
                },
              },
            },
          ]
        : 'ignore-loader', // For now it seems better to ignore them
    },
    // provide polyfill for vfile (ex: used in react-markdown)
    {
      test: /node_modules\/vfile\/core\.js/,
      use: [
        {
          loader: 'imports-loader',
          options: {
            type: 'commonjs',
            imports: ['single process/browser process'],
          },
        },
      ],
    },
  ]
}

function setupPlugins(
  verbose,
  debug,
  renderHtml,
  assetsUrl,
  additionalPlugins = []
) {
  const plugins = [
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      openAnalyzer: false,
      logLevel: verbose ? 'info' : 'error',
    }),
  ]

  if (debug) {
    const PLUGIN_NAME = 'client-dev-plugin'
    class ClientDevPlugin {
      apply(compiler) {
        /* Alternative to console -> Logger interface
        const logger = compiler.getInfrastructureLogger(PLUGIN_NAME)
        logger.info('Hello from the logger') */

        compiler.hooks.done.tap(PLUGIN_NAME, () => {
          console.log(`  ${chalk.magenta('⚛')} Browser client ready.`)
          console.log(
            `  ${chalk.magenta('✨')} Project is running at: ${chalk.blue(
              assetsUrl.href
            )}`
          )
        })
      }
    }
    // Client debug
    plugins.push(
      new webpack.HotModuleReplacementPlugin(),
      new HtmlWebpackPlugin({
        templateContent: renderHtml(),
        filename: 'index.html',
        alwaysWriteToDisk: true,
      }),
      // HtmlWebpackHarddiskPlugin is an extension for HtmlWebpackPlugin
      // It allows the use of 'alwaysWriteToDisk' option
      new HtmlWebpackHarddiskPlugin(),
      new ClientDevPlugin()
    )
  } else {
    // Client prod
    plugins.push(
      new MiniCssExtractPlugin({
        // Options similar to the same options in webpackOptions.output
        // both options are optional
        filename: '[name].[contenthash].css',
        chunkFilename: '[name].[contenthash].css',
      })
    )
  }

  additionalPlugins.length && plugins.push(...additionalPlugins)

  return plugins
}

module.exports = function getBaseConfigClient(
  {
    apiUrl,
    assetsUrl,
    debug,
    dirs,
    forcePolyfill,
    publicPath,
    serverUrl,
    verbose,
    additionalIncludes,
    additionalEntries,
    additionalPlugins,
  },
  renderHtml,
  stats
) {
  const main = 'client'
  const entry = additionalEntries
    ? {
        [main]: [path.resolve(dirs.src, main)],
        ...additionalEntries,
      }
    : {
        [main]: [path.resolve(dirs.src, main)],
      }

  // Loading rules
  const rules = setupRules(
    dirs,
    debug,
    forcePolyfill,
    verbose,
    additionalIncludes
  )
  // Plugins
  const plugins = setupPlugins(
    verbose,
    debug,
    renderHtml,
    assetsUrl,
    additionalPlugins
  )

  const filename = debug ? '[name].js' : '[name].[contenthash].js'

  return {
    mode: debug ? 'development' : 'production',
    entry,
    output: {
      path: dirs.assets,
      filename,
      chunkFilename: filename,
      publicPath,
      libraryTarget: void 0,
      assetModuleFilename: '[hash][ext][query]',
    },
    watch: void 0,
    target: 'web',
    optimization: {
      runtimeChunk: {
        name: 'runtime',
      },
      splitChunks: {
        cacheGroups: {
          defaultVendors: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'initial',
            reuseExistingChunk: true,
          },
        },
      },
    },
    performance: {
      hints: debug ? false : 'warning',
      maxEntrypointSize: 5120000,
      maxAssetSize: 5120000,
    },
    resolve: {
      extensions: ['.mjs', '.js', '.jsx'],
      // provide polyfill for path
      fallback: {
        path: require.resolve('path-browserify'),
      },
    },
    module: { rules },
    stats,
    devServer: {
      host: assetsUrl.hostname,
      port: assetsUrl.port,
      contentBase: dirs.assets,
      publicPath,
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
    plugins,
  }
}
