// Source: huayan-robotics/SDK_sample/CppLinux_SDK/src/Sample_FreeDrive.cpp
// Saved 2026-04-14 for offline reference.
//
// NOTE: This sample demonstrates FORCE-BASED free drive (HRIF_SetForceFreeDriveMode)
// which requires a force/torque sensor. The Elfin Pro E03 typically does NOT have one.
// For a force-sensor-less cobot, use the simpler GrpOpenFreeDriver / GrpCloseFreeDriver
// commands from HansRobotAPI_Base.java instead.

#include "CommonForInterface.h"
#include "HR_Pro.h"
#include <iostream>
#include <unistd.h>

/**
 *	@brief: 初始化设置自由驱动 (Initialize free drive settings)
 */
void InitFreeDrive()
{
    int nRet = -1;
    int nX = 0, nY = 0, nZ = 1, nRx = 0, nRy = 0, nRz = 0; // z-only freedom in this example
    nRet = HRIF_SetFreeDriveMotionFreedom(0, 0, nX, nY, nZ, nRx, nRy, nRz);
    IsSuccess(nRet, "HRIF_SetFreeDriveMotionFreedom");

    double dMaxLinearVelocity = 100;
    double dMaxAngularVelocity = 30;
    nRet = HRIF_SetMaxFreeDriveVel(0, 0, dMaxLinearVelocity, dMaxAngularVelocity);
    IsSuccess(nRet, "HRIF_SetMaxFreeDriveVel");

    double dLinear = 50;
    double dAngular = 50;
    nRet = HRIF_SetFTFreeFactor(0, 0, dLinear, dAngular);
    IsSuccess(nRet, "HRIF_SetFTFreeFactor");

    double dMax_X = 500, dMax_Y = 500, dMax_Z = 500;
    double dMax_Rx = 50, dMax_Ry = 50, dMax_Rz = 50;
    double dMin_X = 300, dMin_Y = 300, dMin_Z = 300;
    double dMin_Rx = 30, dMin_Ry = 30, dMin_Rz = 30;
    nRet = HRIF_SetForceDataLimit(0, 0, dMax_X, dMax_Y, dMax_Z, dMax_Rx, dMax_Ry, dMax_Rz,
                                  dMin_X, dMin_Y, dMin_Z, dMin_Rx, dMin_Ry, dMin_Rz);
    IsSuccess(nRet, "HRIF_SetForceDataLimit");

    double dForceThreshold=10;
    double dTorqueThreshold=0.4;
    nRet = HRIF_SetFTWrenchThresholds(0, 0, dForceThreshold, dTorqueThreshold);
    IsSuccess(nRet, "HRIF_SetFTWrenchThresholds");

    double dForce = 0;
    double dX = 0, dY = 0, dZ = 0;
    nRet = HRIF_SetFreeDriveCompensateForce(0, 0, dForce, dX, dY, dZ);
    IsSuccess(nRet, "HRIF_SetFreeDriveCompensateForce");
}

void ReadFTMotionFreedom()
{
    int nX, nY, nZ, nRx, nRy, nRz;
    int nRet = HRIF_ReadFTMotionFreedom(0, 0, nX, nY, nZ, nRx, nRy, nRz);
    std::cout << "FreeDrive freedom:" << nX << "," << nY << "," << nZ << ","
              << nRx << "," << nRy << "," << nRz << std::endl;
}

void SetForceZero()
{
    int nRet = -1;
    nRet = HRIF_SetForceZero(0, 0);
    sleep(5);
    double dX = 0, dY = 0, dZ = 0, dRx = 0, dRy = 0, dRz = 0;
    nRet = HRIF_ReadFTCabData(0, 0, dX, dY, dZ, dRx, dRy, dRz);
    std::cout << "Calibrated F/T data:" << dX << "," << dY << "," << dZ << ","
              << dRx << "," << dRy << "," << dRz << std::endl;
}

void StarFreeDrive()
{
    int nCurFSM=0;
    int nRet = HRIF_MoveJ(0, 0,
                      420, 0, 445, 180, 0, 180,
                      0, 0, 0, 0, 0, 0,
                      "TCP", "Base", 50, 100, 50, 0, 0, 0, 0, "0");
    IsSuccess(nRet, "HRIF_MoveJ");
    while (true)
    {
        bool bDone = false;
        nRet = HRIF_IsBlendingDone(0, 0, bDone);
        if (bDone == true) break;
    }
    nRet = HRIF_SetForceFreeDriveMode(0, 0, 1);
    IsSuccess(nRet, "HRIF_SetForceFreeDriveMode");
    do {
        HRIF_ReadCurFSMFromCPS(0, 0, nCurFSM);
    } while (nCurFSM != 25); // 25 = Moving (with force-free-drive active)
}

void StopFreeDrive()
{
    int nCurFSM=0;
    int nRet = HRIF_SetForceFreeDriveMode(0, 0, 0);
    IsSuccess(nRet, "HRIF_SetForceFreeDriveMode");
    do {
        HRIF_ReadCurFSMFromCPS(0, 0, nCurFSM);
    } while (nCurFSM != 33); // 33 = StandBy
}
