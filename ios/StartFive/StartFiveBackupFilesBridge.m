#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(StartFiveBackupFiles, NSObject)

RCT_EXTERN_METHOD(saveBackup:(NSString *)suggestedName
                  bytesBase64:(NSString *)bytesBase64
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(pickBackup:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
