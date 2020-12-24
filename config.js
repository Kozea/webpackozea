const { WebpackManifestPlugin } = require('webpack-manifest-plugin')
const webpack = require('webpack')
const { merge } = require('webpack-merge')

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
  return stats
}

function getCommonConfig({ verbose, debug, staging }) {
  return {
    mode: debug ? 'development' : 'production',
    devtool: debug ? 'inline-source-map' : false,
    module: {
      rules: [
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
      extensions: ['.mjs', '.js', '.jsx'],
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
