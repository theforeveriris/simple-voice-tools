/**
 * 设置对话框组件
 * 用于配置应用的外观、图表和检测参数
 */
import { useRef, useEffect, useState } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import gsap from 'gsap';
import { Palette, Sliders, Sun, Moon, Monitor, Mic, Settings } from 'lucide-react';

/**
 * 设置对话框组件
 * @returns React.ReactNode - 设置对话框组件
 */
export function SettingsDialog() {
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);
  const updateChartSettings = useStore((state) => state.updateChartSettings);
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * 入场动画效果
   * 当对话框打开时，使用 GSAP 添加平滑的动画过渡
   */
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const ctx = gsap.context(() => {
        gsap.fromTo(
          containerRef.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out' }
        );

        const sections = containerRef.current?.querySelectorAll('.settings-section');
        sections?.forEach((section, i) => {
          gsap.fromTo(
            section,
            { opacity: 0, x: -20 },
            { opacity: 1, x: 0, duration: 0.4, delay: 0.1 * i, ease: 'expo.out' }
          );
        });
      });

      return () => ctx.revert();
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          className={cn(
            'w-full flex items-center gap-3 px-4 py-3 rounded-xl',
            'text-sm font-medium transition-all duration-300',
            'hover:scale-[1.02] active:scale-[0.98]',
            'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
          aria-label="打开设置"
        >
          <Settings className="w-5 h-5 transition-transform duration-300 group-hover:rotate-6" />
          <span>设置</span>
        </button>
      </DialogTrigger>
      <DialogContent ref={dialogRef} className="sm:max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>
        <div ref={containerRef} className="py-4">
          <p className="text-sm text-muted-foreground mb-6">
            自定义应用外观和检测参数
          </p>

          <div className="space-y-8">
            {/* Appearance settings */}
            <div className="settings-section">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold">外观</h3>
                  <p className="text-sm text-muted-foreground">自定义主题和配色</p>
                </div>
              </div>

              <div className="glass-card p-6 space-y-6">
                {/* Theme */}
                <div className="space-y-3">
                  <Label>主题模式</Label>
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

                <Separator />

                {/* Color scheme */}
                <div className="space-y-3">
                  <Label>图表配色方案</Label>
                  <Select
                    value={settings.chart.colorScheme}
                    onValueChange={(v) => updateChartSettings({ colorScheme: v as any })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择配色方案" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-gradient-to-r from-gray-700 to-gray-400" />
                          默认
                        </div>
                      </SelectItem>
                      <SelectItem value="ocean">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-gradient-to-r from-blue-600 to-cyan-400" />
                          海洋
                        </div>
                      </SelectItem>
                      <SelectItem value="flame">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-gradient-to-r from-red-600 to-orange-400" />
                          火焰
                        </div>
                      </SelectItem>
                      <SelectItem value="forest">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-gradient-to-r from-green-700 to-green-400" />
                          森林
                        </div>
                      </SelectItem>
                      <SelectItem value="purple">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-gradient-to-r from-purple-700 to-purple-400" />
                          紫色
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
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold">图表设置</h3>
                  <p className="text-sm text-muted-foreground">调整坐标轴和显示选项</p>
                </div>
              </div>

              <div className="glass-card p-6 space-y-6">
                {/* Frequency range */}
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <Label>最小频率</Label>
                    <span className="text-sm text-muted-foreground mono">
                      {settings.chart.minFreq} Hz
                    </span>
                  </div>
                  <Slider
                    value={[settings.chart.minFreq]}
                    onValueChange={([v]) => updateChartSettings({ minFreq: v })}
                    min={20}
                    max={500}
                    step={5}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between">
                    <Label>最大频率</Label>
                    <span className="text-sm text-muted-foreground mono">
                      {settings.chart.maxFreq} Hz
                    </span>
                  </div>
                  <Slider
                    value={[settings.chart.maxFreq]}
                    onValueChange={([v]) => updateChartSettings({ maxFreq: v })}
                    min={1000}
                    max={8000}
                    step={100}
                  />
                </div>

                <Separator />

                {/* Display options */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="cursor-pointer">显示网格</Label>
                    <p className="text-xs text-muted-foreground">在图表中显示网格线</p>
                  </div>
                  <Switch
                    checked={settings.chart.showGrid}
                    onCheckedChange={(v) => updateChartSettings({ showGrid: v })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="cursor-pointer">显示标签</Label>
                    <p className="text-xs text-muted-foreground">在图表中显示坐标轴标签</p>
                  </div>
                  <Switch
                    checked={settings.chart.showLabels}
                    onCheckedChange={(v) => updateChartSettings({ showLabels: v })}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between">
                    <Label>线条粗细</Label>
                    <span className="text-sm text-muted-foreground mono">
                      {settings.chart.lineWidth}px
                    </span>
                  </div>
                  <Slider
                    value={[settings.chart.lineWidth]}
                    onValueChange={([v]) => updateChartSettings({ lineWidth: v })}
                    min={1}
                    max={5}
                    step={0.5}
                  />
                </div>
              </div>
            </div>

            {/* Detection settings */}
            <div className="settings-section">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                  <Mic className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold">检测设置</h3>
                  <p className="text-sm text-muted-foreground">调整音高检测参数</p>
                </div>
              </div>

              <div className="glass-card p-6 space-y-6">
                {/* Sensitivity */}
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <Label>检测灵敏度</Label>
                    <span className="text-sm text-muted-foreground mono">
                      {(settings.sensitivity * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Slider
                    value={[settings.sensitivity * 100]}
                    onValueChange={([v]) => updateSettings({ sensitivity: v / 100 })}
                    min={10}
                    max={100}
                    step={5}
                  />
                  <p className="text-xs text-muted-foreground">
                    较高的灵敏度会检测更微弱的音高，但可能增加误报
                  </p>
                </div>

                <Separator />

                {/* Min energy */}
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <Label>最小能量阈值</Label>
                    <span className="text-sm text-muted-foreground mono">
                      {settings.minEnergy}
                    </span>
                  </div>
                  <Slider
                    value={[settings.minEnergy]}
                    onValueChange={([v]) => updateSettings({ minEnergy: v })}
                    min={50}
                    max={300}
                    step={10}
                  />
                  <p className="text-xs text-muted-foreground">
                    过滤低于此能量的信号，用于消除背景噪音
                  </p>
                </div>
              </div>
            </div>

            {/* About */}
            <div className="settings-section text-center py-8">
              <p className="text-sm text-muted-foreground">
                Simple Voice Tools v1.0
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                基于谐波累加算法的实时音高检测
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 主题按钮组件
 * 用于选择应用的主题模式
 * 
 * @param {string} value - 主题值（light/dark/system）
 * @param {string} current - 当前选中的主题值
 * @param {React.ElementType} icon - 主题图标组件
 * @param {string} label - 主题名称
 * @param {function} onClick - 点击回调函数
 * @returns {React.ReactNode} - 主题按钮组件
 */
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
        'flex-1 flex flex-col items-center gap-2 p-4 rounded-xl',
        'border-2 transition-all duration-300',
        'hover:scale-[1.02] active:scale-[0.98]',
        current === value
          ? 'border-primary bg-primary/5'
          : 'border-transparent bg-secondary hover:bg-secondary/80'
      )}
    >
      <Icon className={cn('w-6 h-6', current === value && 'text-primary')} />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
