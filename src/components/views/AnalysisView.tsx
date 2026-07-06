import { useEffect, useRef, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import gsap from 'gsap';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AnalysisView() {
  const pitchTrackingHistory = useStore((state) => state.pitchTrackingHistory);
  const clearPitchTrackingHistory = useStore((state) => state.clearPitchTrackingHistory);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate analysis data
  const analysisData = useMemo(() => {
    if (pitchTrackingHistory.length === 0) return null;

    const freqs = pitchTrackingHistory.map((p) => p.freq);
    const minFreq = Math.min(...freqs);
    const maxFreq = Math.max(...freqs);
    const avgFreq = freqs.reduce((a, b) => a + b, 0) / freqs.length;
    
    // Calculate median
    const sortedFreqs = [...freqs].sort((a, b) => a - b);
    const medianFreq = sortedFreqs[Math.floor(sortedFreqs.length / 2)];
    
    // Calculate 95th percentiles
    const low95 = sortedFreqs[Math.floor(sortedFreqs.length * 0.05)];
    const high95 = sortedFreqs[Math.floor(sortedFreqs.length * 0.95)];

    // Vocal range classification
    let male = 0, female = 0, neutral = 0;
    pitchTrackingHistory.forEach((p) => {
      if (p.freq >= 85 && p.freq <= 180) male++;
      else if (p.freq >= 165 && p.freq <= 255) female++;
      else neutral++;
    });
    const total = pitchTrackingHistory.length;

    // Dummy volume data (since we don't have actual volume data)
    const volumeData = {
      environment: 48.2,
      average: 52.1,
      median: 49.5,
      high95: 57.1,
      low95: 41.8
    };

    return {
      averageFreq: avgFreq,
      medianFreq: medianFreq,
      minFreq,
      maxFreq,
      low95,
      high95,
      malePercent: Math.round((male / total) * 100),
      femalePercent: Math.round((female / total) * 100),
      neutralPercent: Math.round((neutral / total) * 100),
      totalSamples: total,
      volume: volumeData
    };
  }, [pitchTrackingHistory]);



  // Reset data
  const resetData = () => {
    clearPitchTrackingHistory();
  };

  // Entrance animation
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        containerRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' }
      );
    });

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="h-full flex flex-col">
      {/* Main content */}
      <div className="flex-1">
        {!analysisData ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">暂无录音数据</h3>
              <p className="text-muted-foreground max-w-md text-sm">请先进行录音，然后再查看分析结果。</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Frequency visualization */}
            <div className="glass-card p-4 rounded-lg">
              <div className="relative mb-6">
                {/* Frequency scale */}
                <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gradient-to-b from-gray-400 to-gray-600 rounded-full">
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-gray-400 rounded-full" />
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-gray-600 rounded-full" />
                  <div className="absolute top-0 left-5 text-xs text-muted-foreground">350Hz</div>
                  <div className="absolute bottom-0 left-5 text-xs text-muted-foreground">50Hz</div>
                </div>

                {/* Circular visualization */}
                <div className="flex justify-center items-center gap-6 ml-10">
                  {/* Main frequency circle */}
                  <div className="w-28 h-28 rounded-full bg-primary/10 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{analysisData.averageFreq.toFixed(1)}Hz</div>
                    </div>
                  </div>

                  {/* Gender distribution */}
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-20 h-20 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-xl font-bold text-purple-500">{analysisData.femalePercent}%</div>
                        <div className="text-xs text-muted-foreground">女性</div>
                      </div>
                    </div>
                    <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-lg font-bold text-blue-500">{analysisData.malePercent}%</div>
                        <div className="text-xs text-muted-foreground">男性</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pitch details */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold mb-2">音高</h3>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-sm">平均值：</span>
                      <span className="text-sm">{analysisData.averageFreq.toFixed(1)}Hz</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-sm">中位数：</span>
                      <span className="text-sm">{analysisData.medianFreq.toFixed(1)}Hz</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-sm">高 (95%)：</span>
                      <span className="text-sm">{analysisData.high95.toFixed(1)}Hz</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-sm">低 (95%)：</span>
                      <span className="text-sm">{analysisData.low95.toFixed(1)}Hz</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-sm">女性音域范围：</span>
                      <span className="text-sm text-purple-500">{analysisData.femalePercent}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-sm">中性音域范围：</span>
                      <span className="text-sm">{analysisData.neutralPercent}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-sm">男性音域范围：</span>
                      <span className="text-sm text-blue-500">{analysisData.malePercent}%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold mb-2">音调</h3>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-sm">极高：</span>
                      <span className="text-sm">0%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-sm">极低：</span>
                      <span className="text-sm">0%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold mb-2">音量</h3>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-sm">环境：</span>
                      <span className="text-sm">{analysisData.volume.environment.toFixed(1)}db</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-sm">平均值：</span>
                      <span className="text-sm">{analysisData.volume.average.toFixed(1)}db</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-sm">中位数：</span>
                      <span className="text-sm">{analysisData.volume.median.toFixed(1)}db</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-sm">高 (95%)：</span>
                      <span className="text-sm">{analysisData.volume.high95.toFixed(1)}db</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-sm">低 (95%)：</span>
                      <span className="text-sm">{analysisData.volume.low95.toFixed(1)}db</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action button */}
            <Button className="w-full py-4 text-base">
              发送结果
            </Button>

            {/* Control buttons */}
            <div className="flex gap-3">
              <Button
                onClick={resetData}
                variant="secondary"
                className="w-full gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                重置
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
