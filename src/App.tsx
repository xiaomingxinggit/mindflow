import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import FlowchartBoard from './FlowchartBoard'

export default function App() {
  return <ReactFlowProvider><FlowchartBoard /></ReactFlowProvider>
}
