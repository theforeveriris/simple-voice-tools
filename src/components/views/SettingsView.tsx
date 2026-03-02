import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Palette, Sliders, Sun, Moon, Monitor, Mic, RefreshCw, Github } from 'lucide-react';

export function SettingsView() {
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const updateChartSettings = useStore((state) => state.updateChartSettings);

  const handleResetSettings = () => {
    // Reset settings to default values
    updateSettings({
      theme: 'system',
      zenMode: false,
      sensitivity: 0.7,
      minEnergy: 100
    });
    updateChartSettings({
      lineWidth: 2,
      colorScheme: 'default'
    });
  };

  return (
    <div className="h-full overflow-auto pb-12">
      {/* Header */}
      <div className="mb-8 text-center pt-6">
        <h1 className="text-2xl font-bold mb-2">设置</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          自定义应用外观和检测参数
        </p>
      </div>

      <div className="space-y-6 max-w-md mx-auto px-4">
        {/* Appearance settings */}
        <div className="settings-section">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Palette className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">外观</h3>
          </div>

          <div className="bg-white/5 dark:bg-black/10 rounded-xl border border-white/10 dark:border-black/20 p-5">
            {/* Theme */}
            <div className="space-y-3 mb-5">
              <Label className="text-sm font-medium">主题模式</Label>
              <div className="flex gap-3">
                <ThemeButton
                  value="light"
                  current={settings.theme}
                  icon={Sun}
                  label="浅色"
                  onClick={() => updateSettings({ theme: 'light' })}
                />
                <ThemeButton
                  value="dark"
                  current={settings.theme}
                  icon={Moon}
                  label="深色"
                  onClick={() => updateSettings({ theme: 'dark' })}
                />
                <ThemeButton
                  value="system"
                  current={settings.theme}
                  icon={Monitor}
                  label="系统"
                  onClick={() => updateSettings({ theme: 'system' })}
                />
              </div>
            </div>

            <Separator className="my-4" />

            {/* Color scheme */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">图表配色方案</Label>
              <Select
                value={settings.chart.colorScheme}
                onValueChange={(v) => updateChartSettings({ colorScheme: v as any })}
              >
                <SelectTrigger className="w-full rounded-lg border border-white/20 bg-white/5 dark:bg-black/15">
                  <SelectValue placeholder="选择配色方案" />
                </SelectTrigger>
                <SelectContent className="rounded-lg border border-white/20 bg-white/95 dark:bg-black/95">
                  <SelectItem value="default" className="rounded-lg hover:bg-primary/10 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-gradient-to-r from-gray-700 to-gray-400" />
                      <span>默认</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ocean" className="rounded-lg hover:bg-primary/10 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" />
                      <span>海洋</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="flame" className="rounded-lg hover:bg-primary/10 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-gradient-to-r from-red-600 to-orange-400" />
                      <span>火焰</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="forest" className="rounded-lg hover:bg-primary/10 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-gradient-to-r from-green-700 to-green-400" />
                      <span>森林</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="purple" className="rounded-lg hover:bg-primary/10 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-gradient-to-r from-purple-700 to-purple-400" />
                      <span>紫色</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Chart settings */}
        <div className="settings-section">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sliders className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">图表设置</h3>
          </div>

          <div className="bg-white/5 dark:bg-black/10 rounded-xl border border-white/10 dark:border-black/20 p-5">
            {/* Line width */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">线条粗细</Label>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-muted-foreground">细</span>
                <span className="text-xs font-medium">{settings.chart.lineWidth}px</span>
                <span className="text-xs text-muted-foreground">粗</span>
              </div>
              <Slider
                value={[settings.chart.lineWidth]}
                onValueChange={([v]) => updateChartSettings({ lineWidth: v })}
                min={1}
                max={5}
                step={0.5}
                className="py-2"
              />
            </div>
          </div>
        </div>

        {/* Detection settings */}
        <div className="settings-section">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Mic className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">检测设置</h3>
          </div>

          <div className="bg-white/5 dark:bg-black/10 rounded-xl border border-white/10 dark:border-black/20 p-5">
            {/* Zen Mode */}
            <div className="flex items-center justify-between mb-4">
              <Label className="text-sm font-medium">禅模式</Label>
              <Switch
                checked={settings.zenMode}
                onCheckedChange={(v) => updateSettings({ zenMode: v })}
              />
            </div>

            <Separator className="my-4" />

            {/* Sensitivity */}
            <div className="space-y-3 mb-4">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-medium">检测灵敏度</Label>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10">
                  {(settings.sensitivity * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-muted-foreground">低</span>
                <span className="text-xs text-muted-foreground">高</span>
              </div>
              <Slider
                value={[settings.sensitivity * 100]}
                onValueChange={([v]) => updateSettings({ sensitivity: v / 100 })}
                min={10}
                max={100}
                step={5}
                className="py-2"
              />
            </div>

            <Separator className="my-4" />

            {/* Min energy */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-medium">最小能量阈值</Label>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10">
                  {settings.minEnergy}
                </span>
              </div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-muted-foreground">低</span>
                <span className="text-xs text-muted-foreground">高</span>
              </div>
              <Slider
                value={[settings.minEnergy]}
                onValueChange={([v]) => updateSettings({ minEnergy: v })}
                min={50}
                max={300}
                step={10}
                className="py-2"
              />
            </div>
          </div>
        </div>

        {/* Reset settings */}
        <div className="settings-section">
          <button
            onClick={handleResetSettings}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-3 rounded-lg transition-all duration-300',
              'border border-white/10 dark:border-black/20',
              'bg-white/5 dark:bg-black/10 hover:bg-white/10 dark:hover:bg-black/20',
              'text-foreground hover:text-primary'
            )}
          >
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm font-medium">重置所有设置</span>
          </button>
        </div>

        {/* About */}
        <div className="settings-section">
          <div className="bg-white/5 dark:bg-black/10 rounded-xl border border-white/10 dark:border-black/20 p-6 text-center">
            <h3 className="text-lg font-bold mb-1">Simple Voice Tools</h3>
            <p className="text-xs text-muted-foreground mb-3">v1.0</p>
            <div className="flex justify-center gap-3">
              <a 
                href="#" 
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 dark:bg-black/10 border border-white/10 dark:border-black/20 hover:bg-white/10 dark:hover:bg-black/20 transition-all duration-300"
              >
                <Github className="w-3 h-3" />
                <span className="text-xs">GitHub</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeButton({
  value,
  current,
  icon: Icon,
  label,
  onClick,
}: {
  value: string;
  current: string;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex flex-col items-center gap-2 p-3 rounded-lg',
        'border border-white/10 dark:border-black/20 transition-all duration-300',
        current === value
          ? 'bg-primary/20 border-primary'
          : 'bg-white/5 dark:bg-black/10 hover:bg-white/10 dark:hover:bg-black/20'
      )}
    >
      <div className={cn(
        'w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300',
        current === value
          ? 'bg-primary/80 text-primary-foreground'
          : 'bg-secondary text-muted-foreground'
      )}>
        <Icon className="w-5 h-5" />
      </div>
      <span className={cn(
        'text-xs font-medium transition-colors duration-300',
        current === value ? 'text-primary font-semibold' : 'text-foreground'
      )}>{label}</span>
    </button>
  );
}
