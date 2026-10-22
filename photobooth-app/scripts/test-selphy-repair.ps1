$ErrorActionPreference='Stop'
$scriptPath=Join-Path $PSScriptRoot '../electron/selphy-usb-repair.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Resolve-Path $scriptPath),[ref]$tokens,[ref]$errors)
if($errors.Count){throw $errors[0]}
foreach($name in @('Get-Probe','Invoke-Repair')){
 $fn=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
 Invoke-Expression $fn.Extent.Text
}
$script:admin=$false;$script:mutations=0;$script:addedPort=''
function Test-Admin { $script:admin }
function Get-PnpDevice { $script:nodes }
function Get-PnpDeviceProperty { [pscustomobject]@{Data='usbprint'} }
function Get-CimInstance { $script:queues }
function Get-Service { [pscustomobject]@{Status='Running'} }
function Get-Printer { $null }
function pnputil.exe { $script:mutations++;$global:LASTEXITCODE=0 }
function Start-Sleep {}
function Add-Printer { param($Name,$DriverName,$PortName) $script:mutations++;$script:addedPort=$PortName;$script:queues=@([pscustomobject]@{Name=$Name;DriverName=$DriverName;PortName=$PortName;WorkOffline=$false;PrinterStatus=3}) }
function Set-CimInstance { param($Property) $script:mutations++;$script:queues[0].WorkOffline=$false }
function Assert($condition,$message){if(-not $condition){throw $message}}
$script:nodes=@([pscustomobject]@{InstanceId='USB\VID_04A9&PID_3302&MI_00\test';Status='OK';Problem=''},[pscustomobject]@{InstanceId='USBPRINT\CANONSELPHY_CP1500\test&USB002';Status='OK';Problem=''})
$script:queues=@([pscustomobject]@{Name='Canon SELPHY CP1500';DriverName='Microsoft IPP Class Driver';PortName='USB002';WorkOffline=$false;PrinterStatus=3})
$r=Invoke-Repair;Assert ($r.ok -and $script:mutations -eq 0) 'Healthy IPP printer must remain untouched'
$script:nodes=@();$r=Get-Probe;Assert (-not $r.present -and -not $r.ready) 'A stale queue must not count as connected hardware'
$script:nodes=@([pscustomobject]@{InstanceId='USB\VID_04A9&PID_3302&MI_00\test';Status='OK';Problem=''},[pscustomobject]@{InstanceId='USBPRINT\CANONSELPHY_CP1500\test&USB002';Status='OK';Problem=''})
$script:queues=@();$script:admin=$true;$r=Invoke-Repair;Assert ($r.ok -and $script:addedPort -eq 'USB002') 'Must use CP1500 detected port rather than USB001'
$script:queues[0].WorkOffline=$true;$r=Invoke-Repair;Assert ($r.ok -and -not $script:queues[0].WorkOffline) 'Connected offline queue should be recovered'
$script:nodes=@([pscustomobject]@{InstanceId='USB\VID_04A9&PID_3302\test';Status='OK';Problem=''})
$script:queues=@();$script:addedPort='';$r=Invoke-Repair;Assert (-not $r.ok -and -not $script:addedPort -and -not $r.needsReboot) 'Unknown port must not be guessed or falsely require reboot'
Write-Output 'PASS: healthy no-op, stale queue, exact USB port, offline recovery, unresolved port'
