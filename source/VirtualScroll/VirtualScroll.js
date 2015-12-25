/** @flow */
import shouldPureComponentUpdate from 'react-pure-render/function'
import React, { Component, PropTypes } from 'react'
import cn from 'classnames'
import raf from 'raf'
import {
  getUpdatedOffsetForIndex,
  getVisibleRowIndices,
  initCellMetadata
} from '../utils'
import styles from './VirtualScroll.css'

const IS_SCROLLING_TIMEOUT = 150

/**
 * It is inefficient to create and manage a large list of DOM elements within a scrolling container
 * if only a few of those elements are visible. The primary purpose of this component is to improve
 * performance by only rendering the DOM nodes that a user is able to see based on their current
 * scroll position.
 *
 * This component renders a simple list of elements with a fixed height. It is similar to the
 * 'react-infinite' library's `Infinite` component but offers some additional functionality such as
 * the ability to programmatically scroll to ensure that a specific row/item is visible within the
 * container.
 */
export default class VirtualScroll extends Component {
  static propTypes = {
    /** Optional CSS class name */
    className: PropTypes.string,
    /** Height constraint for list (determines how many actual rows are rendered) */
    height: PropTypes.number.isRequired,
    /** Optional renderer to be used in place of rows when rowsCount is 0 */
    noRowsRenderer: PropTypes.func,
    /**
     * Callback invoked with information about the slice of rows that were just rendered.
     * ({ startIndex, stopIndex }): void
     */
    onRowsRendered: PropTypes.func,
    /** Either a fixed row height (number) or a function that returns the height of a row given its index. */
    rowHeight: PropTypes.oneOfType([PropTypes.number, PropTypes.func]).isRequired,
    /** Responsbile for rendering a row given an index */
    rowRenderer: PropTypes.func.isRequired,
    /** Number of rows in list. */
    rowsCount: PropTypes.number.isRequired,
    /** Row index to ensure visible (by forcefully scrolling if necessary) */
    scrollToIndex: PropTypes.number
  }

  static defaultProps = {
    noRowsRenderer: () => null,
    onRowsRendered: () => null
  }

  constructor (props, context) {
    super(props, context)

    this.state = {
      isScrolling: false,
      scrollTop: 0
    }

    this._onKeyPress = this._onKeyPress.bind(this)
    this._onScroll = this._onScroll.bind(this)
    this._onWheel = this._onWheel.bind(this)
  }

  /**
   * Scroll the list to ensure the row at the specified index is visible.
   * This method exists so that a user can forcefully scroll to the same row twice.
   * (The :scrollToIndex property would not change in that case, so it would not be picked up by the component.)
   */
  scrollToRow (scrollToIndex) {
    this._updateScrollTopForScrollToIndex(scrollToIndex)
  }

  /**
   * Forced recompute of row heights.
   * This function should be called if dynamic row heights have changed but nothing else has.
   * Since VirtualScroll receives a :rowsCount it has no way of knowing if the underlying list data has changed.
   */
  recomputeRowHeights () {
    this._computeCellMetadata()
    this.forceUpdate()
  }

  componentDidMount () {
    const { scrollToIndex } = this.props

    if (scrollToIndex >= 0) {
      // Without setImmediate() the initial scrollingContainer.scrollTop assignment doesn't work
      this._scrollTopId = setImmediate(() => {
        this._scrollTopId = null
        this._updateScrollTopForScrollToIndex()
      })
    }
  }

  componentWillUnmount () {
    if (this._disablePointerEventsTimeoutId) {
      clearTimeout(this._disablePointerEventsTimeoutId)
    }
    if (this._scrollTopId) {
      clearImmediate(this._scrollTopId)
    }
    if (this._setNextStateAnimationFrameId) {
      raf.cancel(this._setNextStateAnimationFrameId)
    }
  }

  componentDidUpdate (prevProps, prevState) {
    const { height, rowsCount, rowHeight, scrollToIndex } = this.props
    const { scrollTop } = this.state

    const previousRowsCount = prevProps.rowsCount

    // Make sure any changes to :scrollTop (from :scrollToIndex) get applied
    if (scrollTop >= 0 && scrollTop !== prevState.scrollTop) {
      this.refs.scrollingContainer.scrollTop = scrollTop
    }

    const hasScrollToIndex = scrollToIndex >= 0 && scrollToIndex < rowsCount
    const sizeHasChanged = (
      height !== prevProps.height ||
      !prevProps.rowHeight ||
      (
        rowHeight instanceof Number &&
        rowHeight !== prevProps.rowHeight
      )
    )

    // If we have a new scroll target OR if height/row-height has changed,
    // We should ensure that the scroll target is visible.
    if (hasScrollToIndex && (sizeHasChanged || scrollToIndex !== prevProps.scrollToIndex)) {
      this._updateScrollTopForScrollToIndex()

    // If we don't have a selected item but list size or number of children have decreased,
    // Make sure we aren't scrolled too far past the current content.
    } else if (!hasScrollToIndex && (height < prevProps.height || rowsCount < previousRowsCount)) {
      const calculatedScrollTop = getUpdatedOffsetForIndex({
        cellMetadata: this._cellMetadata,
        containerSize: height,
        currentOffset: scrollTop,
        targetIndex: rowsCount - 1
      })

      // Only adjust the scroll position if we've scrolled below the last set of rows.
      if (calculatedScrollTop < scrollTop) {
        this._updateScrollTopForScrollToIndex(rowsCount - 1)
      }
    }
  }

  componentWillMount () {
    this._computeCellMetadata()
  }

  componentWillUpdate (prevProps, prevState) {
    const { rowsCount } = this.props

    if (rowsCount === 0) {
      this.setState({ scrollTop: 0 })
    }
  }

  render () {
    const {
      className,
      height,
      noRowsRenderer,
      onRowsRendered,
      rowHeight,
      rowsCount,
      rowRenderer
    } = this.props

    const {
      isScrolling,
      scrollTop
    } = this.state

    // Shift the visible rows down so that they remain visible while scrolling.
    // This mimicks scrolling behavior within a non-virtualized list.
    let paddingTop = scrollTop
    let childrenToDisplay = []

    // Render only enough rows to cover the visible (vertical) area of the table.
    if (height > 0) {
      const {
        start,
        stop
      } = getVisibleRowIndices({
        cellCount: rowsCount,
        cellMetadata: this._cellMetadata,
        containerSize: height,
        currentOffset: scrollTop
      })

      for (let i = start; i <= stop; i++) {
        childrenToDisplay.push(rowRenderer(i))
      }

      onRowsRendered({
        startIndex: start,
        stopIndex: stop
      })

      // Adjust for smoother scrolling
      const staticRowHeight = rowHeight instanceof Function
        ? rowHeight(start)
        : rowHeight
      paddingTop -= (scrollTop % staticRowHeight)
    }

    return (
      <div
        ref='scrollingContainer'
        className={cn(styles.VirtualScroll, className)}
        onKeyDown={this._onKeyPress}
        onScroll={this._onScroll}
        onWheel={this._onWheel}
        tabIndex={0}
        style={{
          height: height
        }}
      >
        {rowsCount > 0 &&
          <div
            className={styles.InnerScrollContainer}
            style={{
              height: this._getTotalRowsHeight(),
              maxHeight: this._getTotalRowsHeight(),
              paddingTop: paddingTop,
              pointerEvents: isScrolling ? 'none' : 'auto'
            }}
          >
            {childrenToDisplay}
          </div>
        }
        {rowsCount === 0 &&
          noRowsRenderer()
        }
      </div>
    )
  }

  _computeCellMetadata () {
    const { rowHeight, rowsCount } = this.props
    
    this._cellMetadata = initCellMetadata({
      cellCount: rowsCount,
      size: rowHeight
    })
  }

  _getTotalRowsHeight () {
    const datum = this._cellMetadata[this._cellMetadata.length - 1]
    return datum.offset + datum.size
  }

  /**
   * Updates the state during the next animation frame.
   * Use this method to avoid multiple renders in a small span of time.
   * This helps performance for bursty events (like onWheel).
   */
  _setNextState (state) {
    if (this._setNextStateAnimationFrameId) {
      raf.cancel(this._setNextStateAnimationFrameId)
    }

    this._setNextStateAnimationFrameId = raf(() => {
      this._setNextStateAnimationFrameId = null
      this.setState(state)
    })
  }

  _stopEvent (event) {
    event.preventDefault()
    event.stopPropagation()
  }

  /**
   * Sets an :isScrolling flag for a small window of time.
   * This flag is used to disable pointer events on the scrollable portion of the table (the rows).
   * This prevents jerky/stuttery mouse-wheel scrolling.
   */
  _temporarilyDisablePointerEvents () {
    if (this._disablePointerEventsTimeoutId) {
      clearTimeout(this._disablePointerEventsTimeoutId)
    }

    this._disablePointerEventsTimeoutId = setTimeout(() => {
      this._disablePointerEventsTimeoutId = null
      this.setState({
        isScrolling: false
      })
    }, IS_SCROLLING_TIMEOUT)
  }

  /**
   * Calculates and adjusts scrollTop if necessary to ensure that the row at the specified index is visible.
   */
  _updateScrollTopForScrollToIndex (scrollToIndexOverride) {
    const scrollToIndex = scrollToIndexOverride !== undefined
      ? scrollToIndexOverride
      : this.props.scrollToIndex

    const { height } = this.props
    const { scrollTop } = this.state

    if (scrollToIndex >= 0) {
      const calculatedScrollTop = getUpdatedOffsetForIndex({
        cellMetadata: this._cellMetadata,
        containerSize: height,
        currentOffset: scrollTop,
        targetIndex: scrollToIndex
      })

      if (scrollTop !== calculatedScrollTop) {
        this.setState({ scrollTop: calculatedScrollTop })
      }
    }
  }

  _onKeyPress (event) {
    const { height, rowsCount } = this.props
    const { scrollTop } = this.state

    let start, datum, newScrollTop

    switch (event.key) {
      case 'ArrowDown':
        this._stopEvent(event) // Prevent key from also scrolling surrounding window

        start = getVisibleRowIndices({
          cellCount: rowsCount,
          cellMetadata: this._cellMetadata,
          containerSize: height,
          currentOffset: scrollTop
        }).start
        datum = this._cellMetadata[start]
        newScrollTop = Math.min(
          this._getTotalRowsHeight() - height,
          scrollTop + datum.size
        )

        this.setState({
          scrollTop: newScrollTop
        })
        break
      case 'ArrowUp':
        this._stopEvent(event) // Prevent key from also scrolling surrounding window

        start = getVisibleRowIndices({
          cellCount: rowsCount,
          cellMetadata: this._cellMetadata,
          containerSize: height,
          currentOffset: scrollTop
        }).start

        this.scrollToRow(Math.max(0, start - 1))
        break
    }
  }

  _onScroll (event) {
    // In certain edge-cases React dispatches an onScroll event with an invalid target.scrollTop.
    // This invalid event can be detected by comparing event.target to this component's scrollable DOM element.
    // See issue #404 for more information.
    if (event.target !== this.refs.scrollingContainer) {
      return
    }

    // When this component is shrunk drastically, React dispatches a series of back-to-back scroll events,
    // Gradually converging on a scrollTop that is within the bounds of the new, smaller height.
    // This causes a series of rapid renders that is slow for long lists.
    // We can avoid that by doing some simple bounds checking to ensure that scrollTop never exceeds the total height.
    const { height } = this.props
    const totalRowsHeight = this._getTotalRowsHeight()
    const scrollTop = Math.min(totalRowsHeight - height, event.target.scrollTop)

    // Certain devices (like Apple touchpad) rapid-fire duplicate events.
    // Don't force a re-render if this is the case.
    if (this.state.scrollTop === scrollTop) {
      return
    }

    // Prevent pointer events from interrupting a smooth scroll
    this._temporarilyDisablePointerEvents()

    // The mouse may move faster then the animation frame does.
    // Use requestAnimationFrame to avoid over-updating.
    this._setNextState({
      isScrolling: true,
      scrollTop
    })
  }

  _onWheel (event) {
    const scrollTop = this.refs.scrollingContainer.scrollTop

    // Certain devices (like Apple touchpad) rapid-fire duplicate events.
    // Don't force a re-render if this is the case.
    if (this.state.scrollTop === scrollTop) {
      return
    }

    // Prevent pointer events from interrupting a smooth scroll
    this._temporarilyDisablePointerEvents()

    // The mouse may move faster then the animation frame does.
    // Use requestAnimationFrame to avoid over-updating.
    this._setNextState({
      isScrolling: true,
      scrollTop
    })
  }
}
VirtualScroll.prototype.shouldComponentUpdate = shouldPureComponentUpdate
