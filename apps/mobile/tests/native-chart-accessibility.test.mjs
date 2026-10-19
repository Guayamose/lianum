import test from 'node:test';
import assert from 'node:assert/strict';
import * as echarts from 'echarts/core.js';
import {SVGRenderer} from 'echarts/renderers.js';
import {LineChart} from 'echarts/charts.js';
import {GridComponent,AriaComponent} from 'echarts/components.js';
import {chartAriaV1} from '../src/design/charts/chart-accessibility-v1.ts';
echarts.use([SVGRenderer,LineChart,GridComponent,AriaComponent]);
test('ECharts renders on a native-shaped host without browser DOM accessibility functions',()=>{
 const nativeHost={};const chart=echarts.init(nativeHost,undefined,{renderer:'svg',ssr:true,width:350,height:190});
 const option={animation:false,aria:chartAriaV1('android','Precio de Ethereum'),xAxis:{type:'category',data:['a','b']},yAxis:{type:'value'},series:[{type:'line',data:[1800,1900]}]};
 try{assert.doesNotThrow(()=>chart.setOption(option));assert.ok(chart.renderToSVGString().includes('<path'));assert.equal(chartAriaV1('ios','Precio').enabled,false);assert.equal(chartAriaV1('web','Precio').enabled,true);}finally{chart.dispose();}
});
