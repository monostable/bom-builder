import * as immutable from 'immutable'
import * as reselect from 'reselect'

import {emptyRetailers} from './state'
import * as selectors from './selectors'

export function getLines(state) {
  const linesMap = state
    .get('lines')
    .map(line => line.update('partNumbers', ps => ps.slice(0, -1)))
    .map(line => line.set('reference', line.get('reference') || ''))
  const order = state.get('order')
  return order.map(lineId => linesMap.get(lineId))
}

export function retailerSelectionNumbers(lines) {
  return lines.reduce((prev, line, lineId) => {
    line.get('retailers').forEach((sku, retailer) => {
      if (sku) {
        prev = prev.update(retailer, x => x + 1)
      }
    })
    return prev
  }, emptyRetailers.map(x => 0))
}

export function priorityOfRetailers(lines, alwaysBuySkus) {
  const fromSelection = retailerSelectionNumbers(lines)
    .sort((v1, v2) => v2 - v1)
    .keySeq()
    .toList()
  const numberOfAlwaysBuy = alwaysBuySkus.reduce((prev, skus) => {
    if (skus != null) {
      skus.forEach((_, sku) => {
        prev = prev.update(sku.get('vendor'), x => (x || 0) + 1)
      })
    }
    return prev
  }, immutable.Map())
  return fromSelection.sort(
    (r1, r2) =>
      (numberOfAlwaysBuy.get(r2) || 0) - (numberOfAlwaysBuy.get(r1) || 0)
  )
}

export function reduceBom(
  lines,
  preferred,
  alwaysBuySkus,
  done = immutable.List()
) {
  return lines.map((line, lineId) => {
    const part = line.getIn(['retailers', preferred])
    let alwaysBuyThisLine = alwaysBuySkus.get(lineId)
    if (alwaysBuyThisLine != null && alwaysBuyThisLine.size > 0) {
      alwaysBuyThisLine = true
    }
    if (part) {
      return line.update('retailers', retailers => {
        return retailers.map((v, k) => {
          if (alwaysBuyThisLine) {
            const sku = immutable.Map({vendor: k, part: v})
            return alwaysBuySkus.getIn([lineId, sku]) ? v : ''
          }
          if (k === preferred || done.includes(k)) {
            return v
          }
          return ''
        })
      })
    }
    return line
  })
}

export function getAllOffers(suggestions) {
  return suggestions.map(x => x.get('data')).reduce((offers, suggestions) => {
    suggestions = suggestions || immutable.List()
    return suggestions.reduce(
      (offers, part) =>
        part
          .get('offers')
          .reduce(
            (offers, offer) => offers.set(offer.get('sku'), offer),
            offers
          ),
      offers
    )
  }, immutable.Map())
}

export function makeAllOffersSelector(suggestionsSelector) {
  return reselect.createSelector([suggestionsSelector], getAllOffers)
}

export function getInStockLines(lines, offers, buyMultiplier, alwaysBuySkus) {
  return lines.map((line, lineId) =>
    line.update('retailers', retailers =>
      retailers.map((part, vendor) => {
        if (part) {
          const sku = immutable.Map({part, vendor})
          if (alwaysBuySkus.getIn([lineId, sku])) {
            return part
          }
          const offer = offers.get(sku)
          let in_stock, stock_location
          if (offer) {
            in_stock = offer.get('in_stock_quantity')
            if (offer.get('multipack_quantity') != null) {
              in_stock *= offer.get('multipack_quantity')
            }
            stock_location = offer.get('stock_location')
          }
          if (
            in_stock &&
            in_stock >= Math.ceil(line.get('quantity') * buyMultiplier) &&
            stock_location !== 'US'
          ) {
            return part
          }
        }
        return ''
      })
    )
  )
}

export function makeInStockLinesSelector(linesSelector, allOffersSelector) {
  return reselect.createSelector(
    [
      linesSelector,
      allOffersSelector,
      selectors.buyMultiplier,
      selectors.alwaysBuySkus
    ],
    getInStockLines
  )
}

export function getPurchaseLines(preferred, lines, alwaysBuySkus) {
  lines = reduceBom(lines, preferred, alwaysBuySkus)
  const priority = priorityOfRetailers(lines, alwaysBuySkus).filter(
    r => r !== preferred
  )
  const {reducedLines} = priority.reduce(
    ({reducedLines, done}, retailer) => {
      reducedLines = reduceBom(reducedLines, retailer, alwaysBuySkus, done)
      done = done.push(retailer)
      return {reducedLines, done}
    },
    {reducedLines: lines, done: immutable.List.of(preferred)}
  )
  return reducedLines
}

export function makePurchaseLinesSelector(
  preferredSelector,
  linesSelector,
  previewBuySelector,
  suggestionsSelector
) {
  const allOffersSelector = makeAllOffersSelector(suggestionsSelector)
  const inStockLinesSelector = makeInStockLinesSelector(
    linesSelector,
    allOffersSelector
  )
  return reselect.createSelector(
    [
      preferredSelector,
      inStockLinesSelector,
      previewBuySelector,
      selectors.alwaysBuySkus
    ],
    (preferred, lines, previewBuy, alwaysBuySkus) => {
      if (previewBuy) {
        return getPurchaseLines(preferred, lines, alwaysBuySkus)
      }
    }
  )
}