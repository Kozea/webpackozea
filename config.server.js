/* eslint-env node */
/* eslint-disable no-console */

const childProcess = require('child_process')
const path = require('path')

const chalk = require('chalk')
const ManifestPlugin = require('webpack-manifest-plugin')
const nodeExternals = require('webpack-node-externals')
const webpack = require('webpack')

function setupRules(dirs, verbose) {
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
                targets: { node: true },
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
  rules.push({ test: /\.(css|sass)$/, use: 'ignore-loader' })
  return rules
}

function setupPlugins(staging, debug, serverUrl, dirs, inspect, cwd) {
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
    // Server debug
    // Start and restart server
    console.log(
      `  ${chalk.magenta('⯂')} Node koaze server: ${chalk.blue(serverUrl.href)}`
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
  }

  return plugins
}

module.exports = function getBaseConfigServer({
  cwd,
  debug,
  dirs,
  inspect,
  publicPath,
  serverUrl,
  staging,
  verbose,
}) {
  const main = 'server'

  const entry = {}
  entry[main] = []

  // Main entry point
  entry[main].push(path.resolve(dirs.src, main))

  // Loading rules
  const rules = setupRules(dirs, verbose)
  // Plugins
  const plugins = setupPlugins(staging, debug, serverUrl, dirs, inspect, cwd)

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
  const filename = '[name].js'

  const conf = {
    mode: debug ? 'development' : 'production',
    entry,
    // Defines the output file for the html script tag
    output: {
      path: dirs.dist,
      filename,
      // We might need to remove [name] here for long time cache
      chunkFilename: filename,
      publicPath,
      libraryTarget: 'commonjs2',
    },
    watch: debug ? true : void 0,
    target: 'node',
    optimization: void 0,
    performance: {
      hints: false,
    },

    resolve: {
      extensions: ['.mjs', '.js', '.jsx'],
    },

    // Entry points list, allow to load a file with transforms
    module: { rules },
    stats,
    // Webpack plugins
    plugins,
  }

  if (debug) {
    conf.devtool = 'inline-source-map'
  }

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

  return conf
}
