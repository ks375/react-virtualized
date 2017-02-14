/** @flow */
import { PureComponent } from 'react'
import { findDOMNode } from 'react-dom'

type Props = {
  cache: any,
  children: mixed,
  columnIndex: number,
  parent: any,
  rowIndex: number
};

function warnAboutImproperUse (parent) {
  if (process.env.NODE_ENV !== 'production') {
    if (
      parent &&
      parent.props.deferredMeasurementCache === undefined
    ) {
      console.warn('CellMeasurer should be rendered within a Grid that has a deferredMeasurementCache prop')
    }
  }
}

/**
 * Wraps a cell and measures its rendered content.
 * Measurements are stored in a per-cell cache.
 * Cached-content is not be re-measured.
 */
export default class CellMeasurer extends PureComponent {
  props: Props;

  constructor (props, context) {
    super(props, context)

    this._measure = this._measure.bind(this)
  }

  componentDidMount () {
    this._maybeMeasureCell()
  }

  componentDidUpdate (prevProps, prevState) {
    this._maybeMeasureCell()
  }

  render () {
    const { children } = this.props

    if (process.env.NODE_ENV !== 'production') {
      const { parent } = this.props

      warnAboutImproperUse(parent)
    }

    return typeof children === 'function'
      ? children({ measure: this._measure })
      : children
  }

  _maybeMeasureCell () {
    const { cache, columnIndex, parent, rowIndex } = this.props

    if (!cache.has(rowIndex, columnIndex)) {
      const node = findDOMNode(this)
      const height = node.offsetHeight
      const width = node.offsetWidth

      cache.set(
        rowIndex,
        columnIndex,
        width,
        height
      )

      // If size has changed, let Grid know to re-render.
      if (parent !== undefined) {
        parent.invalidateCellSizeAfterRender({
          columnIndex,
          rowIndex
        })
      }
    }
  }

  _measure (force = false) {
    const { cache, columnIndex, parent, rowIndex } = this.props

    const node = findDOMNode(this)
    const height = node.offsetHeight
    const width = node.offsetWidth

    if (
      height !== cache.getHeight(rowIndex, columnIndex) ||
      width !== cache.getWidth(rowIndex, columnIndex)
    ) {
      cache.set(
        rowIndex,
        columnIndex,
        width,
        height
      )

      parent.recomputeGridSize({
        columnIndex,
        rowIndex
      })
    }
  }
}
