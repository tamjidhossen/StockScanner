import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'

import { ModeToggle } from '@/components/mode-toggle'

interface Stock {
  symbol: string
  name: string
  sector: string
  price: number
  status: 'HALAL' | 'NOT_HALAL' | 'DOUBTFUL'
}

const sampleStocks: Stock[] = [
  { symbol: 'SQURPHARMA', name: 'Square Pharmaceuticals Ltd.', sector: 'Pharmaceuticals', price: 216.5, status: 'HALAL' },
  { symbol: 'GP', name: 'Grameenphone Ltd.', sector: 'Telecommunication', price: 285.2, status: 'HALAL' },
  { symbol: 'BATBC', name: 'British American Tobacco BD', sector: 'Food & Allied', price: 412.0, status: 'NOT_HALAL' },
  { symbol: 'BEXIMCO', name: 'Beximco Ltd.', sector: 'Miscellaneous', price: 115.6, status: 'DOUBTFUL' },
]

export default function App() {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredStocks = sampleStocks.filter(
    (s) =>
      s.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Navbar */}
      <header className="border-b border-border/40 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
              DSE
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">StockScanner</h1>
              <p className="text-xs text-muted-foreground">Dhaka Stock Exchange • Halal Screener</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="font-mono text-xs">
              Live Ready
            </Badge>
            <ModeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Tracked</CardDescription>
              <CardTitle className="text-2xl font-bold">392</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">All listed DSE securities</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Halal Compliant</CardDescription>
              <CardTitle className="text-2xl font-bold text-primary">148</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Passed Shariah financial screening</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Under Review / Doubtful</CardDescription>
              <CardTitle className="text-2xl font-bold">24</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Requires detailed audit</p>
            </CardContent>
          </Card>
        </div>

        {/* Screening Section */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle>DSE Stocks</CardTitle>
                <CardDescription>
                  Filter and examine Shariah compliance status of DSE listed equities
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <Input
                  className="w-full md:w-64"
                  placeholder="Search symbol or company..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Button variant="outline" size="sm" onClick={() => setSearchTerm('')}>
                  Reset
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead className="text-right">Price (BDT)</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStocks.map((stock) => (
                  <TableRow key={stock.symbol}>
                    <TableCell className="font-semibold">{stock.symbol}</TableCell>
                    <TableCell className="text-muted-foreground">{stock.name}</TableCell>
                    <TableCell>{stock.sector}</TableCell>
                    <TableCell className="text-right font-mono">{stock.price.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      {stock.status === 'HALAL' && (
                        <Badge variant="default">Halal</Badge>
                      )}
                      {stock.status === 'NOT_HALAL' && (
                        <Badge variant="destructive">Non-Halal</Badge>
                      )}
                      {stock.status === 'DOUBTFUL' && (
                        <Badge variant="secondary">Doubtful</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
