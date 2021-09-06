const { WebpackManifestPlugin } = require('webpack-manifest-plugin')
const webpack = require('webpack')
const { merge } = require('webpack-merge')
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')

const getServerConfig = require('./config.server')
const getClientConfig = require('./config.client')

function getStats(verbose) {
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
        warnings: true,
        logging: 'info',
      }
    : {
        logging: 'none',
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
  return stats
}

function getCommonConfig({ verbose, debug, staging }) {
  return {
    mode: debug ? 'development' : 'production',
    devtool: debug ? 'inline-source-map' : 'source-map',
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          loader: 'ts-loader',
          options: {
            // disable type checking
            // it will be performed in separate process
            // thanks to 'fork-ts-checker-webpack-plugin'
            transpileOnly: true,
          },
        },
        {
          test: /\.(jpg|jpeg|png|gif|pdf)$/i,
          type: 'asset/resource',
        },
        {
          test: /\.(woff|woff2|svg|ttf|eot|otf)$/i,
          type: 'asset/inline',
        },
      ],
    },
    stats: getStats(verbose),
    resolve: {
      extensions: ['.mjs', '.js', '.jsx', '.ts', '.tsx'],
    },
    plugins: [
      // Common all
      new WebpackManifestPlugin({
        writeToFileEmit: true,
      }),
      // DON'T use JSON stringify and yes it needs multiple quotes
      // (JSON is imported by babel in a file that use module.exports => X[)
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': `"${process.env.NODE_ENV || 'development'}"`,
        'process.env.STAGING': `${!!staging}`,
      }),
      new ForkTsCheckerWebpackPlugin(),
    ],
  }
}

function getBaseConfigClient(config, renderHtml) {
  const commonCfg = getCommonConfig(config)
  const clientCfg = getClientConfig(
    config,
    renderHtml,
    getStats(config.verbose)
  )
  const conf = merge(commonCfg, clientCfg)
  return conf
}

function getBaseConfigServer(config) {
  const commonCfg = getCommonConfig(config)
  const serverCfg = getServerConfig(config)
  const conf = merge(commonCfg, serverCfg)
  return conf
}

module.exports = {
  getBaseConfigClient,
  getBaseConfigServer,
}
