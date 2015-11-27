import { render } from 'react-dom'
import FlexTableExample from './FlexTable/FlexTable.example'
import React from 'react'
import VirtualScrollExample from './VirtualScroll/VirtualScroll.example'

render((
    <div>
      <VirtualScrollExample/>
      <FlexTableExample/>
    </div>
  ),
  document.getElementById('root')
)
