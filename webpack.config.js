'use strict';

const path = require('path');

const extensionConfig = {
  target: 'node',
  entry: './src/frontend/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'vscode',
    serialport: 'serialport'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  }
};

const adapterConfig = {
  target: 'node',
//  entry: './src/gdb.ts',
  entry: {
    'gdb': './src/frontend/debugadapter.ts'
  },
  devtool: "source-map",
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'debugadapter.js',
    //filename: 'gdb.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]',
  },
  externals: {
    vscode: 'vscode',
    serialport: 'serialport'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  }
}

const grapherConfig = {
  target: 'web',
  entry: {
    'grapher': './src/grapher/main.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'vscode',
    serialport: 'serialport'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  }
};
module.exports = [extensionConfig, adapterConfig, grapherConfig];


/*"scripts": {
        "postinstall": "node ./node_modules/vscode/bin/install",
        "vscode:prepublish": "webpack --mode production",
        "watch": "webpack --mode development --watch",
        "compile": "webpack --mode development",
        "test-compile": "tsc -p ./"
    },
    
    
    
    {
		"prepublish": "tsc -p ./",
		"compile": "tsc -p ./",
		"tslint": "tslint ./**//*.ts",
		"watch": "tsc -w -p ./",
		"test": "mocha -u tdd ./out/tests/",
		"postinstall": "node ./node_modules/vscode/bin/install",
  }
  
  */