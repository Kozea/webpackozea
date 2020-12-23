/* eslint-env node */
/* eslint-disable no-console */

const childProcess = require('child_process')
const path = require('path')

const chalk = require('chalk')
const nodeExternals = require('webpack-node-externals')

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
  ]
  rules.push({ test: /\.(css|sass)$/, use: 'ignore-loader' })
  return rules
}

function setupPlugins(debug, serverUrl, dirs, inspect, cwd) {
  const plugins = []

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

module.exports = function getServerConfig({
  cwd,
  debug,
  dirs,
  inspect,
  publicPath,
  serverUrl,
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
  const plugins = setupPlugins(debug, serverUrl, dirs, inspect, cwd)

  const filename = '[name].js'

  const conf = {
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

    // Entry points list, allow to load a file with transforms
    module: { rules },
    // Webpack plugins
    plugins,
    node: {
      __dirname: true,
    },
    externals: [
      nodeExternals({
        modulesDir: dirs.modules,
        allowlist: [/\.css$/],
      }),
    ],
  }

  return conf
}
