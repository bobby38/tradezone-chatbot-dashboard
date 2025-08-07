import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LucideIcon } from 'lucide-react'

interface BigNumberProps {
  label: string
  value: number | string
  description?: string
  icon?: LucideIcon
  trend?: {
    value: number
    isPositive: boolean
  }
  format?: 'number' | 'currency' | 'percentage'
}

export function BigNumber({ 
  label, 
  value, 
  description, 
  icon: Icon, 
  trend,
  format = 'number' 
}: BigNumberProps) {
  const formatValue = (val: number | string) => {
    const numVal = typeof val === 'string' ? parseFloat(val) : val
    
    switch (format) {
      case 'currency':
        return `S$${numVal.toLocaleString('en-SG', { minimumFractionDigits: 2 })}`
      case 'percentage':
        return `${numVal.toFixed(1)}%`
      default:
        return numVal.toLocaleString()
    }
  }

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {Icon && (
          <Icon className="h-4 w-4 text-muted-foreground" />
        )}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {formatValue(value)}
        </div>
        {description && (
          <CardDescription className="text-xs mt-1">
            {description}
          </CardDescription>
        )}
        {trend && (
          <div className="flex items-center space-x-1 text-xs mt-2">
            <span className={`font-medium ${
              trend.isPositive ? 'text-green-600' : 'text-red-600'
            }`}>
              {trend.isPositive ? '+' : ''}{trend.value}%
            </span>
            <span className="text-muted-foreground">from yesterday</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
