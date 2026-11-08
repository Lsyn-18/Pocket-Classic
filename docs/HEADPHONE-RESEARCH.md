# 3.5mm EarPods：参考与实现依据

调研日期：2026-11-08。先核对真实配件，再制作原创三维模型与连接动画。

## 已核实的外观

- [苹果官方 EarPods（3.5mm）](https://www.apple.com/shop/product/mwu53am/a/earpods-35mm-headphone-plug) 的产品图同时展示耳塞侧面、背面和插头：直式白色圆柱护套、银色触点、三道浅色绝缘环、细白线；耳塞是不带硅胶套的非对称白色硬壳，带黑色出音网罩和狭窄通气口。
- [苹果有线耳机说明](https://support.apple.com/en-gb/108042) 将 3.5mm、Lightning、USB-C 三款明确区分；本项目模拟的是 3.5mm 插头，不采用另外两款接口。官方兼容列表包含 2009 年 iPod classic 160GB。
- [iFixit EarPods 拆解](https://www.ifixit.com/Teardown/Apple+EarPods+Teardown/10501) 可辅助核对硬壳结构和线控；EarPods 是后于 2009 年推出的配件，这里是按用户要求搭配 Classic，并非声称它是 2009 年原配耳塞。

外观以官方图片比例为参考，不宣称为测绘级尺寸模型。官方图片仅用于调研，不打包进应用；运行时使用自行构建的几何模型。

## 动画依据

查到的是官方静态产品图、插接说明及拆解，没有找到可核实的苹果官方“3.5mm 插入动画”。因此本项目制作原创机械动作：插头沿孔轴对准，触点逐渐进入插孔，白色护套落座，线缆小幅滞后摆动并衰减停稳。拔出反向执行；快速插拔从当前姿态连续过渡。

苹果产品说明支持直接插入 3.5mm 插孔。动画不套用 AirPods 充电盒配对弹窗，也不改变手机实际音频路由。蓝牙耳机按用户要求触发同样的虚拟有线 EarPods 效果。

## 安卓检测依据

[AudioDeviceCallback](https://developer.android.com/reference/android/media/AudioDeviceCallback) 用于接收音频设备加入 / 移除通知；结合 [AudioDeviceInfo](https://developer.android.com/reference/android/media/AudioDeviceInfo) 和 `AudioManager.getDevices(GET_DEVICES_OUTPUTS)` 读取已连接输出。

检测模拟耳机、有线耳麦、USB 耳机 / USB 音频、经典蓝牙 A2DP / SCO、BLE 耳机及助听设备；排除手机扬声器、听筒、HDMI 与明确标记的 BLE 音箱。不扫描附近蓝牙，不读取设备名称或地址，不增加麦克风、定位或蓝牙扫描权限。经典 A2DP 和部分 USB 音频在公共音频接口中也可能代表音箱，因此这一无额外权限的方案无法对它们做到严格的耳机 / 音箱区分。
