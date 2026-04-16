package com.runfitpure

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class HardwareStepCounterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), SensorEventListener {

    private var sensorManager: SensorManager? = null
    private var stepCounterSensor: Sensor? = null
    private var stepDetectorSensor: Sensor? = null
    private var isListening = false
    private var initialSteps: Int = -1

    override fun getName() = "HardwareStepCounter"

    @ReactMethod
    fun start(promise: Promise) {
        if (isListening) {
            promise.resolve(true)
            return
        }
        sensorManager = reactApplicationContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        stepCounterSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        stepDetectorSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)

        if (stepCounterSensor == null && stepDetectorSensor == null) {
            promise.reject("E_NO_STEP_SENSOR", "Step sensor not available on this device")
            return
        }

        // Register step counter (cumulative) - most accurate
        val registered = sensorManager?.let {
            val counterOk = if (stepCounterSensor != null) {
                it.registerListener(this, stepCounterSensor, SensorManager.SENSOR_DELAY_NORMAL)
            } else false
            val detectorOk = if (stepDetectorSensor != null) {
                it.registerListener(this, stepDetectorSensor, SensorManager.SENSOR_DELAY_NORMAL)
            } else false
            counterOk || detectorOk
        } ?: false

        if (registered) {
            isListening = true
            initialSteps = -1
            promise.resolve(true)
        } else {
            promise.reject("E_REGISTRATION_FAILED", "Failed to register step sensor listener")
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        if (!isListening) {
            promise.resolve(true)
            return
        }
        sensorManager?.unregisterListener(this)
        isListening = false
        initialSteps = -1
        promise.resolve(true)
    }

    @ReactMethod
    fun isAvailable(promise: Promise) {
        val sm = reactApplicationContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val hasCounter = sm?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null
        val hasDetector = sm?.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) != null
        promise.resolve(hasCounter || hasDetector)
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_STEP_COUNTER -> {
                val totalSteps = event.values[0].toInt()
                // First reading - set as baseline
                if (initialSteps < 0) {
                    initialSteps = totalSteps
                }
                val stepsSinceStart = totalSteps - initialSteps
                sendEvent("onStepCount", Arguments.createMap().apply {
                    putInt("steps", stepsSinceStart)
                    putInt("totalSteps", totalSteps)
                    putString("source", "TYPE_STEP_COUNTER")
                })
            }
            Sensor.TYPE_STEP_DETECTOR -> {
                // TYPE_STEP_DETECTOR fires once per step
                sendEvent("onStepDetected", Arguments.createMap().apply {
                    putDouble("timestamp", System.currentTimeMillis().toDouble())
                    putString("source", "TYPE_STEP_DETECTOR")
                })
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {
        // Not used but required by interface
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }
}
