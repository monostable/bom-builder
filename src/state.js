const immutable      = require('immutable')
const reduxImmutable = require('redux-immutable')
const oneClickBom = require('1-click-bom')

function getId() {
  this.id = this.id || 0
  return this.id++
}

const emptyLine = immutable.Map({
  reference   : '',
  quantity    : '',
  partNumbers : immutable.Set(),
  retailers: immutable.Map({
    Digikey : '',
    Mouser  : '',
    RS      : '',
    Farnell : '',
    Newark  : '',
  }),
})

const initialState = immutable.Map({
  lines: immutable.OrderedMap(),
  view: immutable.Map({
  }),
})

const linesReducers = {
  addLine(lines, value) {
    return lines.set(getId(), value)
  },
  removeLine(lines, value) {
    return lines.filter((_,key) => key !== value)
  },
  addPartNumber(lines, value) {
    const {id, partNumber} = value
    const line = lines.get(id).update(
      'partNumbers',
      ps => ps.add(partNumber)
    )
    return lines.set(id, line)
  },
  addSku(lines, value) {
    const {id, sku} = value
    const line = lines.get(id).setIn(
      ['retailers', sku.get('vendor')],
      sku.get('part')
    )
    return lines.set(id, line)
  },
  removePartNumber(lines, value) {
    const {id, partNumber} = value
    const line = lines.get(id).update(
      'partNumbers',
      ps => ps.filterNot(p => p.equals(partNumber))
    )
    return lines.set(id, line)
  },
  sortByReference(lines, value) {
    return lines.sortBy(line => line.get('reference'))
  },
  setFromTsv(_, value) {
    const {lines} = oneClickBom.parseTSV(value)
    return immutable.fromJS(lines).map(line => {
      return line.update('partNumbers', ps => ps.toSet())
    })
  },
}

const viewReducers = {}

const mainReducer = reduxImmutable.combineReducers({
  lines: makeMainReducer(linesReducers),
  view: makeMainReducer(viewReducers),
})

function makeMainReducer(reducers) {
  return function reducer(state, action) {
    if (Object.keys(reducers).includes(action.type)) {
      const state2 = reducers[action.type](state, action.value)
      return state2
    }
    return state
  }
}

function makeActions(reducers) {
  const actions = {}
  Object.keys(reducers).forEach(name => {
    actions[name] = function createAction(value) {
      return {type: name, value}
    }
  })
  return actions
}

const actions = Object.assign(
  makeActions(linesReducers),
  makeActions(viewReducers)
)

module.exports = {initialState, mainReducer, linesReducer:makeMainReducer(linesReducers), emptyLine, actions}
