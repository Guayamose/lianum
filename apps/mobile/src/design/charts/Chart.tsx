import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import SvgChart, { SVGRenderer } from '@wuba/react-native-echarts/svgChart';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, GraphChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  GraphicComponent,
} from 'echarts/components';
import type { EChartsCoreOption, ECElementEvent } from 'echarts/core';
import { useMotionAllowed } from '../useMotionAllowed';
import { fonts } from '../chart-fonts';
import {chartAriaV1} from './chart-accessibility-v1';

echarts.use([
  SVGRenderer,
  BarChart,
  LineChart,
  PieChart,
  GraphChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  GraphicComponent,
]);

export function Chart({
  option,
  height,
  label,
  onSelect,
  interactive = true,
}: {
  option: EChartsCoreOption;
  height: number;
  label: string;
  onSelect?: (event: ECElementEvent) => void;
  interactive?: boolean;
}) {
  const ref = useRef<React.ComponentRef<typeof SvgChart>>(null);
  const instance = useRef<echarts.EChartsType | null>(null);
  const [width, setWidth] = useState(0);
  const motion = useMotionAllowed();
  useEffect(() => {
    if (!ref.current || !width) return;
    const chart = echarts.init(ref.current as unknown as HTMLElement, undefined, {
      renderer: 'svg',
      width,
      height,
    });
    instance.current = chart;
    return () => {
      instance.current = null;
      chart.dispose();
    };
  }, [width, height]);
  useEffect(() => {
    instance.current?.setOption(
      {
        textStyle: { fontFamily: fonts.regular },
        animationDuration: 350,
        ...option,
        backgroundColor: 'transparent',
        animation: motion,
        aria: chartAriaV1(Platform.OS,label),
      },
      { notMerge: true },
    );
  }, [width, height, option, motion, label]);
  useEffect(() => {
    const chart = instance.current;
    if (!chart || !onSelect) return;
    chart.on('click', onSelect);
    return () => {
      chart.off('click', onSelect);
    };
  }, [width, height, onSelect]);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width: '100%', height }}
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
    >
      <SvgChart ref={ref} style={{ width, height }} handleGesture={interactive} />
    </View>
  );
}
