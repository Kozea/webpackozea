# Webpackozea

Our base webpack configuration at Kozea for React SSR application

## Installation

### yarn

```bash
yarn add webpackozea
```

### npm

```bash
npm i webpackozea
```

## Usage

In your webpack config file

```js
import { getBaseConfigClient, getBaseConfigServer } from 'webpackozea'
```

## How to use locally

Use [yalc](https://github.com/wclr/yalc) if you want to test your changes locally using a store

### Publish

Clone the webpackozea repo

```bash
git clone git@github.com:Kozea/webpackozea.git
```

In your local copy of webpackozea

```bash
# cd webpack-copy-local
yalc publish
```

Then in your project

```bash
# cd your-project
yalc link webpackozea
```

### Update

Make your changes in your local webpackozea, then push the changes to the store

```bash
# cd webpack-copy-local
yalc push
```

### Remove

To remove the local webpackozea from your project

```bash
# cd your-project
yalc remove webpackozea
```

To remove all local package from your project

```bash
# cd your-project
yalc remove --all
```

### ATTENTION

In your project, each time you `npm install`, `yarn install` or update packages, you have to re-link again

```bash
# cd your-project
yalc link webpackozea
```
